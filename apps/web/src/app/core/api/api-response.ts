import { HttpErrorResponse } from '@angular/common/http';
import { IApiErrorResponse, IApiResponse } from './interfaces';

export function isApiResponse(body: unknown): body is IApiResponse<unknown> {
  return (
    body !== null &&
    typeof body === 'object' &&
    'success' in body &&
    body.success === true &&
    'statusCode' in body &&
    typeof body.statusCode === 'number' &&
    'data' in body
  );
}

export function isApiErrorResponse(body: unknown): body is IApiErrorResponse {
  return (
    body !== null &&
    typeof body === 'object' &&
    'success' in body &&
    body.success === false &&
    'statusCode' in body &&
    typeof body.statusCode === 'number' &&
    'message' in body &&
    (typeof body.message === 'string' ||
      (Array.isArray(body.message) && body.message.every((message: unknown) => typeof message === 'string'))) &&
    'error' in body &&
    typeof body.error === 'string'
  );
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse) || !isApiErrorResponse(error.error)) return fallback;

  const message = error.error.message;
  return (Array.isArray(message) ? message.join('\n') : message) || fallback;
}

// Download requests receive JSON errors as blobs because their responseType is 'blob'.
export async function parseApiErrorBlob(error: HttpErrorResponse): Promise<HttpErrorResponse> {
  if (!(error.error instanceof Blob) || !/\bjson\b/i.test(error.error.type)) return error;

  try {
    const body: unknown = JSON.parse(await error.error.text());
    if (!isApiErrorResponse(body)) return error;

    return new HttpErrorResponse({
      error: body,
      headers: error.headers,
      status: error.status,
      statusText: error.statusText,
      url: error.url ?? undefined,
      redirected: error.redirected,
      responseType: error.responseType
    });
  } catch {
    return error;
  }
}
