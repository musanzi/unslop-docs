import { AssessmentProvider, createAssessmentWorkflow } from '../documents/assessment-workflow';
import { DocumentStorage } from '../documents/document-storage';
import { ProcessingFailure } from '../documents/document-processing';
import { readDocx } from '../documents/validate-docx';
import { DocumentJobs } from './document-jobs';

export class AssessmentWorker {
  private readonly workflow: ReturnType<typeof createAssessmentWorkflow>;

  constructor(
    private readonly jobs: DocumentJobs,
    private readonly storage: Pick<DocumentStorage, 'read'>,
    provider: AssessmentProvider,
    skill: string,
    private readonly settings: { processingTimeoutMs: number; providerTimeoutMs: number }
  ) {
    this.workflow = createAssessmentWorkflow(provider, skill);
  }

  async runOnce(shutdown?: AbortSignal): Promise<boolean> {
    await this.jobs.recover();
    if (shutdown?.aborted) return false;
    const claim = await this.jobs.claim(this.settings.processingTimeoutMs);
    if (!claim) return false;
    const controller = new AbortController();
    let failure: ProcessingFailure = 'provider';
    const interrupt = () => {
      failure = 'interrupted';
      controller.abort();
    };
    shutdown?.addEventListener('abort', interrupt, { once: true });
    if (shutdown?.aborted) interrupt();
    const remaining = claim.processingDeadline.getTime() - Date.now();
    const timeout = setTimeout(
      () => {
        failure = remaining <= this.settings.providerTimeoutMs ? 'deadline' : 'provider';
        controller.abort();
      },
      Math.max(0, Math.min(remaining, this.settings.providerTimeoutMs))
    );
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      this.jobs
        .heartbeat(claim)
        .then((active) => {
          if (!active) interrupt();
        }, interrupt)
        .finally(() => {
          renewing = false;
        });
    }, 10000);
    let abort: () => void;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('Processing stopped'));
      controller.signal.addEventListener('abort', abort, { once: true });
      if (controller.signal.aborted) abort();
    });
    try {
      const work = async () => {
        const source = await readDocx(await this.storage.read(claim.originalKey, claim.size));
        controller.signal.throwIfAborted();
        if (!(await this.jobs.heartbeat(claim))) throw new Error('Inactive claim');
        controller.signal.throwIfAborted();
        return this.workflow.invoke({ text: source.text }, { signal: controller.signal });
      };
      const result = await Promise.race([work(), stopped]);
      if (!(await this.jobs.complete(claim, result.assessment))) await this.jobs.recover();
    } catch {
      await this.jobs.fail(claim, failure);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      shutdown?.removeEventListener('abort', interrupt);
      controller.signal.removeEventListener('abort', abort);
    }
    return true;
  }
}
