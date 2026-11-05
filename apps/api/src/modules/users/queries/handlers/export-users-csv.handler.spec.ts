import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Response } from 'express';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../entities';
import { ExportUsersCsv } from '../impl';
import { ExportUsersCsvHandler } from './export-users-csv.handler';

describe('ExportUsersCsvHandler', () => {
  let handler: ExportUsersCsvHandler;
  const builder = {
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getMany: vi.fn()
  };

  beforeEach(async () => {
    builder.getMany.mockReset().mockResolvedValue([{ name: 'Alice, A', email: 'alice@example.com' }]);
    const module = await Test.createTestingModule({
      providers: [
        ExportUsersCsvHandler,
        { provide: getRepositoryToken(User), useValue: { createQueryBuilder: () => builder } }
      ]
    }).compile();
    handler = module.get(ExportUsersCsvHandler);
  });

  it('streams quoted CSV content with the public column names', async () => {
    let output = '';
    const response = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const completed = finished(response);
    await handler.execute(new ExportUsersCsv({}, response as unknown as Response));
    await completed;
    expect(output).toBe('Name,Email\n"Alice, A",alice@example.com');
    expect(builder.where).not.toHaveBeenCalled();
  });

  it('passes the search term as a bound parameter before exporting', async () => {
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    });
    const completed = finished(response);
    await handler.execute(new ExportUsersCsv({ q: 'Alice' }, response as unknown as Response));
    await completed;
    expect(builder.where).toHaveBeenCalledWith(expect.any(String), { q: '%Alice%' });
  });

  it('translates lookup failures without writing response data', async () => {
    builder.getMany.mockRejectedValue(new Error('query failed'));
    const write = vi.fn((_chunk, _encoding, callback) => callback());
    const response = new Writable({ write });
    await expect(handler.execute(new ExportUsersCsv({}, response as unknown as Response))).rejects.toThrow(
      'Export des utilisateurs impossible'
    );
    expect(write).not.toHaveBeenCalled();
    response.destroy();
  });
});
