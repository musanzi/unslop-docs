export type ProviderFailureCategory =
  'timeout' | 'network' | 'rate_limit' | 'server' | 'authentication' | 'request' | 'output' | 'cancelled' | 'unknown';

export class ProviderFailure extends Error {
  readonly temporary: boolean;

  constructor(
    readonly category: ProviderFailureCategory,
    readonly status?: number
  ) {
    super('Assessment provider failed');
    this.temporary = ['timeout', 'network', 'rate_limit', 'server'].includes(category);
  }
}

export function classifyProviderFailure(error: unknown, signal?: AbortSignal): ProviderFailure {
  if (signal?.aborted) return new ProviderFailure('cancelled');
  if (error instanceof ProviderFailure) return error;
  if (!error || typeof error !== 'object') return new ProviderFailure('unknown');
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  if (status === 408) return new ProviderFailure('timeout', status);
  if (status === 429) return new ProviderFailure('rate_limit', status);
  if (status >= 500 && status <= 599) return new ProviderFailure('server', status);
  if (status === 401 || status === 403) return new ProviderFailure('authentication', status);
  if (status >= 400 && status <= 499) return new ProviderFailure('request', status);
  const name = 'name' in error && error.name !== 'Error' ? error.name : error.constructor?.name;
  const code = 'code' in error ? error.code : undefined;
  if (name === 'AbortError' || name === 'APIUserAbortError') return new ProviderFailure('cancelled');
  if (name === 'APIConnectionTimeoutError' || name === 'TimeoutError' || code === 'ETIMEDOUT')
    return new ProviderFailure('timeout');
  if (
    name === 'APIConnectionError' ||
    ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH'].includes(String(code))
  )
    return new ProviderFailure('network');
  return new ProviderFailure('unknown');
}
