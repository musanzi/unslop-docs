import { validationReasons, ValidationCheck } from './revision-validation';
export const documentStatuses = ['stored', 'queued', 'processing', 'assessed', 'completed', 'failed'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];
export const documentPhases = ['assessment', 'rewrite'] as const;
export type DocumentPhase = (typeof documentPhases)[number];
export const processingStages = ['assessing', 'editing', 'validating', 'final-assessment'] as const;
export type ProcessingStage = (typeof processingStages)[number];
export const defaultRewriteStrength = 50;
export type ProcessingFailure = 'provider' | 'deadline' | 'interrupted' | ValidationCheck;

export const failureMessages: Record<ProcessingFailure, string> = {
  ...(Object.fromEntries(
    Object.entries(validationReasons).map(([key, message]) => [key, `${message} Your original is still available.`])
  ) as Record<ValidationCheck, string>),
  provider:
    'The processing service could not complete this attempt. Retry to try again. Your original is still available.',
  deadline: 'Processing took too long. Your original is still available.',
  interrupted: 'Processing was interrupted. Your original is still available.'
};
