import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const response = {};
  const reply = vi.fn();
  const end = vi.fn();
  const isHeadersSent = vi.fn();
  const host = new ExecutionContextHost([{}, response]);
  let filter: ApiExceptionFilter;

  beforeEach(async () => {
    isHeadersSent.mockReset().mockReturnValue(false);
    const module = await Test.createTestingModule({
      providers: [
        ApiExceptionFilter,
        { provide: HttpAdapterHost, useValue: { httpAdapter: { reply, end, isHeadersSent } } }
      ]
    }).compile();
    filter = module.get(ApiExceptionFilter);
  });

  it('returns the status and message of an expected exception', () => {
    filter.catch(new NotFoundException('Utilisateur introuvable'), host);
    expect(reply).toHaveBeenCalledWith(
      response,
      { success: false, statusCode: 404, message: 'Utilisateur introuvable', error: 'Not Found' },
      404
    );
  });

  it('preserves a plain HTTP exception message', () => {
    filter.catch(new HttpException('Try later', 429), host);
    expect(reply).toHaveBeenCalledWith(
      response,
      { success: false, statusCode: 429, message: 'Try later', error: 'Too Many Requests' },
      429
    );
  });

  it('preserves validation message arrays', () => {
    filter.catch(
      new BadRequestException({ message: ['email must be valid', 'name is required'], error: 'Validation failed' }),
      host
    );
    expect(reply).toHaveBeenCalledWith(
      response,
      {
        success: false,
        statusCode: 400,
        message: ['email must be valid', 'name is required'],
        error: 'Validation failed'
      },
      400
    );
  });

  it.each([{ message: 12, error: {} }, { message: ['valid', 12] }, {}])(
    'falls back to safe messages for malformed exception bodies: %j',
    (body) => {
      filter.catch(new HttpException(body, 400), host);
      expect(reply).toHaveBeenCalledWith(
        response,
        { success: false, statusCode: 400, message: 'Bad Request', error: 'Bad Request' },
        400
      );
    }
  );

  it.each([new Error('private database details'), 'private text', null])(
    'does not expose unexpected failures: %s',
    (exception) => {
      filter.catch(exception, host);
      expect(reply).toHaveBeenCalledWith(
        response,
        { success: false, statusCode: 500, message: 'Internal Server Error', error: 'Internal Server Error' },
        500
      );
    }
  );

  it('ends an already-started response without writing another body', () => {
    isHeadersSent.mockReturnValue(true);
    filter.catch(new BadRequestException(), host);
    expect(end).toHaveBeenCalledWith(response);
    expect(reply).not.toHaveBeenCalled();
  });
});
