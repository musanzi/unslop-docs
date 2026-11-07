import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createRewriteWorkflow } from '../documents/document-workflow';
import { DocumentStorage } from '../documents/document-storage';
import { ProcessingFailure } from '../documents/document-processing';
import { RevisionValidationError } from '../documents/revision-validation';
import { readDocx } from '../documents/validate-docx';
import { DocumentJobs, JobClaim } from './document-jobs';
import { classifyProviderFailure, ProviderFailure } from '../documents/provider-failure';
import { EditProvider, validateChunkResult } from '../documents/revise-docx';
import { documentPreview } from '../documents/document-preview';
import {
  assessmentText,
  detectionMethod,
  detectorModelVersion,
  DocumentDetection,
  validateDetection
} from '../documents/detection-rate';
import { DetectionProvider } from '../documents/local-detector-provider';

class RetryScheduled extends Error {}

export const detectionOperation = 'detection:initial:v1';

export type DocumentProvider = DetectionProvider & EditProvider;

export interface WorkerSettings {
  assessmentTimeoutMs?: number;
  processingTimeoutMs: number;
  providerTimeoutMs: number;
  detectorTimeoutMs?: number;
}

interface ClaimRun {
  claim: JobClaim;
  signal: AbortSignal;
  active: () => Promise<void>;
  request: (
    operation: string,
    input: unknown,
    call: (signal: AbortSignal) => Promise<unknown>,
    validate: (raw: unknown) => unknown
  ) => Promise<unknown>;
  fail: (error: unknown) => Promise<void>;
}

export class AssessmentWorker {
  private readonly logger = new Logger(AssessmentWorker.name);

  constructor(
    private readonly jobs: DocumentJobs,
    private readonly storage: Pick<DocumentStorage, 'read' | 'write' | 'remove'>,
    private readonly provider: DocumentProvider,
    private readonly skill: string,
    private readonly settings: WorkerSettings
  ) {}

  async runOnce(shutdown?: AbortSignal): Promise<boolean> {
    await this.jobs.recover();
    if (shutdown?.aborted) return false;
    const claim = await this.jobs.claim(this.settings);
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
    const invoke = async (call: (signal: AbortSignal) => Promise<unknown>, timeoutMs: number): Promise<unknown> => {
      await active();
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let rejectStopped: () => void;
      const stopped = new Promise<never>((_resolve, reject) => {
        rejectStopped = () => reject(new ProviderFailure(controller.signal.aborted ? 'cancelled' : 'timeout'));
        requestController.signal.addEventListener('abort', rejectStopped, { once: true });
      });
      const providerTimer = setTimeout(abort, Math.min(timeoutMs, claim.processingDeadline.getTime() - Date.now()));
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
    const request: ClaimRun['request'] = async (operation, input, call, validate) => {
      await active();
      const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const prior = claim.providerRequests[operation];
      if (prior && prior.inputHash !== inputHash) throw new Error('Provider request changed during recovery');
      if (prior?.state === 'succeeded') return validate(prior.outcome);
      const checkpoint = await this.jobs.startRequest(claim, operation, inputHash);
      if (!checkpoint) throw new Error('Provider request cannot start');
      let outcome: unknown;
      try {
        const raw = await invoke(
          call,
          operation === detectionOperation
            ? (this.settings.detectorTimeoutMs ?? this.settings.providerTimeoutMs)
            : this.settings.providerTimeoutMs
        );
        try {
          outcome = validate(raw);
        } catch (error) {
          if (error instanceof RevisionValidationError) throw error;
          throw new ProviderFailure('output');
        }
      } catch (error) {
        await active();
        const providerFailure =
          error instanceof RevisionValidationError
            ? new ProviderFailure('output')
            : classifyProviderFailure(error, controller.signal);
        const retryableOutput = operation.startsWith('edit:') && providerFailure.category === 'output';
        const retry = (providerFailure.temporary || retryableOutput) && checkpoint.attempts < 3;
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
        throw error;
      }
      await active();
      if (!(await this.jobs.finishRequest(claim, operation, { ...checkpoint, state: 'succeeded', outcome })))
        throw new Error('Inactive claim');
      return outcome;
    };
    const fail = async (error: unknown) => {
      if (error instanceof RetryScheduled) return;
      if (error instanceof RevisionValidationError) failure = error.check;
      this.logger.warn(`Document processing failed: ${failure}.`);
      await this.jobs.fail(claim, failure);
    };
    const run: ClaimRun = { claim, signal: controller.signal, active, request, fail };
    try {
      if (claim.phase === 'assessment') await this.assess(run);
      else await this.rewrite(run);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      shutdown?.removeEventListener('abort', interrupt);
    }
    return true;
  }

  private async detect(run: ClaimRun, text: string): Promise<DocumentDetection> {
    return (await run.request(
      detectionOperation,
      { method: detectionMethod, model: detectorModelVersion, text },
      (signal) => this.provider.detect(text, signal),
      validateDetection
    )) as DocumentDetection;
  }

  private async assess(run: ClaimRun): Promise<void> {
    const { claim, active } = run;
    try {
      const source = await readDocx(await this.storage.read(claim.originalKey, claim.size));
      await active();
      const detection = await this.detect(run, assessmentText(source));
      await active();
      if (!(await this.jobs.publishAssessment(claim, detection, documentPreview(source)))) await this.jobs.recover();
    } catch (error) {
      await run.fail(error);
    }
  }

  private async rewrite(run: ClaimRun): Promise<void> {
    const { claim, active } = run;
    const revisedKey = claim.revisedKey ?? `${randomUUID()}.docx`;
    let written = claim.revisedKey !== null;
    let saved = claim.revisedKey !== null;
    let published = false;
    try {
      if (claim.assessment === null) {
        const original = await readDocx(await this.storage.read(claim.originalKey, claim.size));
        const detection = await this.detect(run, assessmentText(original));
        await active();
        if (!(await this.jobs.saveInitialAssessment(claim, detection))) throw new Error('Inactive claim');
      }
      if (claim.revisedKey === null) {
        const source = await readDocx(await this.storage.read(claim.originalKey, claim.size));
        await active();
        const workflow = createRewriteWorkflow(
          {
            edit: (system, chunk) =>
              run.request(
                `edit:${chunk.id}`,
                { system, chunk },
                (signal) => this.provider.edit(system, chunk, signal),
                (raw) => ({ edits: validateChunkResult(chunk, raw) })
              )
          },
          this.skill,
          claim.strength,
          {
            stage: async (stage) => {
              await active();
              if (!(await this.jobs.stage(claim, stage))) throw new Error('Inactive claim');
            },
            progress: async (completed, total) => {
              await active();
              if (!(await this.jobs.progress(claim, completed, total))) throw new Error('Inactive claim');
            }
          }
        );
        const result = await workflow.invoke({ source }, { signal: run.signal });
        await active();
        await this.storage.write(revisedKey, result.revised);
        written = true;
        await active();
        saved = await this.jobs.saveRevision(claim, { key: revisedKey, size: result.revised.length }, result.notices);
        if (!saved) {
          await this.jobs.recover();
          return;
        }
      }
      published = await this.jobs.complete(claim);
      if (!published) await this.jobs.recover();
    } catch (error) {
      if (error instanceof RetryScheduled) return;
      if (saved) {
        published = await this.jobs.complete(claim).catch(() => false);
        if (!published) await this.jobs.recover();
        return;
      }
      await run.fail(error);
    } finally {
      if (written && !published) await this.removeOrphanedRevision(claim, revisedKey);
    }
  }

  private async removeOrphanedRevision(claim: JobClaim, revisedKey: string): Promise<void> {
    try {
      if (!(await this.jobs.ownsRevision(claim.id, revisedKey))) await this.storage.remove(revisedKey);
    } catch {
      this.logger.warn('Private revised document cleanup could not be confirmed.');
    }
  }
}
