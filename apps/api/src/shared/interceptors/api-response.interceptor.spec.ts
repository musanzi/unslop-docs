import { StreamableFile } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiResponseInterceptor } from './api-response.interceptor';

describe('ApiResponseInterceptor', () => {
  let interceptor: ApiResponseInterceptor<unknown>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [ApiResponseInterceptor] }).compile();
    interceptor = module.get(ApiResponseInterceptor);
  });

  function intercept(data: unknown, statusCode = 200, headersSent = false) {
    const context = new ExecutionContextHost([{}, { statusCode, headersSent }]);
    return firstValueFrom(interceptor.intercept(context, { handle: () => of(data) }));
  }

  it('wraps data with the actual response status', async () => {
    await expect(intercept({ id: 'user-1' }, 201)).resolves.toEqual({
      success: true,
      statusCode: 201,
      data: { id: 'user-1' }
    });
  });

  it.each([undefined, null])('normalizes absent data to null: %s', async (data) => {
    await expect(intercept(data)).resolves.toEqual({ success: true, statusCode: 200, data: null });
  });

  it.each([false, 0, ''])('preserves meaningful falsy data: %s', async (data) => {
    await expect(intercept(data)).resolves.toEqual({ success: true, statusCode: 200, data });
  });

  it.each([204, 304])('does not wrap responses with status %i', async (statusCode) => {
    await expect(intercept(undefined, statusCode)).resolves.toBeUndefined();
  });

  it('does not wrap a streamed file', async () => {
    const file = new StreamableFile(Buffer.from('file content'));
    await expect(intercept(file)).resolves.toBe(file);
  });

  it('does not wrap a response after headers are sent', async () => {
    const data = { id: 'user-1' };
    await expect(intercept(data, 200, true)).resolves.toBe(data);
  });

  it('leaves errors for the exception filter', async () => {
    const error = new Error('handler failed');
    const result = interceptor.intercept(new ExecutionContextHost([{}, { statusCode: 200 }]), {
      handle: () => throwError(() => error)
    });
    await expect(firstValueFrom(result)).rejects.toBe(error);
  });
});
