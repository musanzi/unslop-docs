import { validationReasons, ValidationCheck } from './revision-validation';
export const documentStatuses = ['stored', 'queued', 'processing', 'assessed', 'completed', 'failed'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];
export type ProcessingFailure = 'provider' | 'deadline' | 'interrupted' | ValidationCheck;

export const failureMessages: Record<ProcessingFailure, string> = {
  ...(Object.fromEntries(
    Object.entries(validationReasons).map(([key, message]) => [key, `${message} Your original is still available.`])
  ) as Record<ValidationCheck, string>),
  provider:
    'Document processing could not be completed. Upload the original again to start a new attempt. Your original is still available.',
  deadline: 'Processing took too long. Your original is still available.',
  interrupted: 'Processing was interrupted. Your original is still available.'
};
