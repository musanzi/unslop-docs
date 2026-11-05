export const documentStatuses = ['stored', 'queued', 'processing', 'assessed', 'failed'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];
export type ProcessingFailure = 'provider' | 'deadline' | 'interrupted';

export const failureMessages: Record<ProcessingFailure, string> = {
  provider: 'The writing assessment could not be completed. Your original is still available.',
  deadline: 'Processing took too long. Your original is still available.',
  interrupted: 'Processing was interrupted. Your original is still available.'
};
