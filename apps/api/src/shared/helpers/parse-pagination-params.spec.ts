import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parsePaginationParams } from './parse-pagination-params';

describe('parsePaginationParams', () => {
  it('defaults to the first page of twenty results', () => {
    expect(parsePaginationParams({})).toEqual({ pageNumber: 1, limitNumber: 20 });
  });

  it('accepts the maximum page size', () => {
    expect(parsePaginationParams({ page: 3, limit: 100 })).toEqual({ pageNumber: 3, limitNumber: 100 });
  });

  it('supports take as an alias while giving limit precedence', () => {
    expect(parsePaginationParams({ take: 5 })).toEqual({ pageNumber: 1, limitNumber: 5 });
    expect(parsePaginationParams({ limit: 10, take: 5 })).toEqual({ pageNumber: 1, limitNumber: 10 });
  });

  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: NaN },
    { page: Infinity },
    { limit: 0 },
    { limit: -1 },
    { limit: 101 },
    { limit: 2.5 },
    { take: 101 },
    { limit: NaN }
  ])('rejects invalid pagination: %j', (params) => {
    expect(() => parsePaginationParams(params)).toThrow(BadRequestException);
  });
});
