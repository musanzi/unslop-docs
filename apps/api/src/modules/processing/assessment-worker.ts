import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createDocumentWorkflow, DocumentProvider } from '../documents/document-workflow';
import { DocumentStorage } from '../documents/document-storage';
import { ProcessingFailure } from '../documents/document-processing';
import { RevisionValidationError } from '../documents/revision-validation';
import { readDocx } from '../documents/validate-docx';
import { DocumentJobs } from './document-jobs';
import { classifyProviderFailure, ProviderFailure } from '../documents/provider-failure';
import { validateAssessment } from '../documents/assessment-workflow';
import { validateChunkResult } from '../documents/revise-docx';

class RetryScheduled extends Error {}

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
      if (Date.now() >= claim.processingDeadline.getTime()) {
        failure = 'deadline';
        controller.abort();
      }
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
    const invoke = async (call: (signal: AbortSignal) => Promise<unknown>): Promise<unknown> => {
      await active();
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let rejectStopped: () => void;
      const stopped = new Promise<never>((_resolve, reject) => {
        rejectStopped = () => reject(new ProviderFailure(controller.signal.aborted ? 'cancelled' : 'timeout'));
        requestController.signal.addEventListener('abort', rejectStopped, { once: true });
      });
      const providerTimer = setTimeout(
        abort,
        Math.min(this.settings.providerTimeoutMs, claim.processingDeadline.getTime() - Date.now())
      );
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
    const request = async (
      operation: string,
      input: unknown,
      call: (signal: AbortSignal) => Promise<unknown>,
      validate: (raw: unknown) => unknown
    ): Promise<unknown> => {
      await active();
      const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const prior = claim.providerRequests[operation];
      if (prior && prior.inputHash !== inputHash) throw new Error('Provider request changed during recovery');
      if (prior?.state === 'succeeded') return validate(prior.outcome);
      const checkpoint = await this.jobs.startRequest(claim, operation, inputHash);
      if (!checkpoint) throw new Error('Provider request cannot start');
      let raw: unknown;
      try {
        raw = await invoke(call);
      } catch (error) {
        await active();
        const providerFailure = classifyProviderFailure(error, controller.signal);
        const retry = providerFailure.temporary && checkpoint.attempts < 3;
        const saved = await this.jobs.finishRequest(
          claim,
          operation,
          {
            ...checkpoint,
            state: retry ? 'retry' : 'failed',
            failure: {
              category: providerFailure.category,
              ...(providerFailure.status ? { status: providerFailure.status } : {})
            }
          },
          retry ? 1000 * 2 ** (checkpoint.attempts - 1) : undefined
        );
        if (!saved) throw providerFailure;
        if (retry) throw new RetryScheduled();
        throw providerFailure;
      }
      let outcome: unknown;
      try {
        outcome = validate(raw);
      } catch (error) {
        await this.jobs.finishRequest(claim, operation, {
          ...checkpoint,
          state: 'failed',
          failure: { category: 'output' }
        });
        throw error;
      }
      await active();
      if (!(await this.jobs.finishRequest(claim, operation, { ...checkpoint, state: 'succeeded', outcome })))
        throw new Error('Inactive claim');
      return outcome;
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
          assess: (system, text) =>
            request(
              'assess:v1',
              { system, text },
              (signal) => this.provider.assess(system, text, signal),
              (raw) => validateAssessment(raw, text)
            ),
          edit: (system, chunk) =>
            request(
              `edit:${chunk.id}`,
              { system, chunk },
              (signal) => this.provider.edit(system, chunk, signal),
              (raw) => ({ edits: validateChunkResult(chunk, raw) })
            )
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
      if (!(error instanceof RetryScheduled)) {
        if (error instanceof RevisionValidationError) failure = error.check;
        this.logger.warn(`Document processing failed: ${failure}.`);
        await this.jobs.fail(claim, failure);
      }
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
