import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createDocumentWorkflow, DocumentProvider } from '../documents/document-workflow';
import { DocumentStorage } from '../documents/document-storage';
import { ProcessingFailure } from '../documents/document-processing';
import { RevisionValidationError } from '../documents/revision-validation';
import { readDocx } from '../documents/validate-docx';
import { DocumentJobs } from './document-jobs';

export class AssessmentWorker {
  private readonly logger = new Logger(AssessmentWorker.name);

  constructor(
    private readonly jobs: DocumentJobs,
    private readonly storage: Pick<DocumentStorage, 'read' | 'write' | 'remove'>,
    private readonly provider: DocumentProvider,
    private readonly skill: string,
    private readonly settings: { processingTimeoutMs: number; providerTimeoutMs: number }
  ) {}

  async runOnce(shutdown?: AbortSignal): Promise<boolean> {
    await this.jobs.recover();
    if (shutdown?.aborted) return false;
    const claim = await this.jobs.claim(this.settings.processingTimeoutMs);
    if (!claim) return false;
    const controller = new AbortController();
    let failure: ProcessingFailure = 'provider';
    const interrupt = () => {
      if (!controller.signal.aborted) failure = 'interrupted';
      controller.abort();
    };
    shutdown?.addEventListener('abort', interrupt, { once: true });
    if (shutdown?.aborted) interrupt();
    const timeout = setTimeout(
      () => {
        failure = 'deadline';
        controller.abort();
      },
      Math.max(0, claim.processingDeadline.getTime() - Date.now())
    );
    const active = async () => {
      controller.signal.throwIfAborted();
      if (!(await this.jobs.heartbeat(claim))) {
        interrupt();
        throw new Error('Inactive claim');
      }
      controller.signal.throwIfAborted();
    };
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      active()
        .catch(interrupt)
        .finally(() => {
          renewing = false;
        });
    }, 10000);
    const request = async (call: (signal: AbortSignal) => Promise<unknown>): Promise<unknown> => {
      await active();
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let rejectStopped: () => void;
      const stopped = new Promise<never>((_resolve, reject) => {
        rejectStopped = () => reject(new Error('Provider request stopped'));
        requestController.signal.addEventListener('abort', rejectStopped, { once: true });
      });
      const providerTimer = setTimeout(abort, this.settings.providerTimeoutMs);
      try {
        const result = await Promise.race([call(requestController.signal), stopped]);
        await active();
        return result;
      } finally {
        clearTimeout(providerTimer);
        controller.signal.removeEventListener('abort', abort);
        requestController.signal.removeEventListener('abort', rejectStopped);
      }
    };
    const revisedKey = `${randomUUID()}.docx`;
    let written = false;
    let published = false;
    let publicationAttempted = false;
    try {
      const source = await readDocx(await this.storage.read(claim.originalKey, claim.size));
      await active();
      const workflow = createDocumentWorkflow(
        {
          assess: (system, text) => request((signal) => this.provider.assess(system, text, signal)),
          edit: (system, chunk) => request((signal) => this.provider.edit(system, chunk, signal))
        },
        this.skill,
        async (stage) => {
          await active();
          if (!(await this.jobs.stage(claim, stage))) throw new Error('Inactive claim');
        }
      );
      const result = await workflow.invoke({ source }, { signal: controller.signal });
      await active();
      await this.storage.write(revisedKey, result.revised);
      written = true;
      await active();
      publicationAttempted = true;
      published = await this.jobs.complete(claim, result.assessment, { key: revisedKey, size: result.revised.length });
      if (!published) await this.jobs.recover();
    } catch (error) {
      if (error instanceof RevisionValidationError) failure = error.check;
      this.logger.warn(`Document processing failed: ${failure}.`);
      await this.jobs.fail(claim, failure);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      shutdown?.removeEventListener('abort', interrupt);
      if (written && !published) {
        try {
          if (!publicationAttempted || !(await this.jobs.isPublished(claim.id, revisedKey)))
            await this.storage.remove(revisedKey);
        } catch {
          this.logger.warn('Private revised document cleanup could not be confirmed.');
        }
      }
    }
    return true;
  }
}
