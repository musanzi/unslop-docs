import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindOrCreateUser, ImportUsersCsv } from '../impl';
import { ImportUsersCsvHandler } from './import-users-csv.handler';

describe('ImportUsersCsvHandler', () => {
  const execute = vi.fn();
  let handler: ImportUsersCsvHandler;
  const command = (csv: string) => new ImportUsersCsv({ buffer: Buffer.from(csv) } as Express.Multer.File);

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [ImportUsersCsvHandler, { provide: CommandBus, useValue: { execute } }]
    }).compile();
    handler = module.get(ImportUsersCsvHandler);
  });

  it('imports only complete normalized rows through the existing user workflow', async () => {
    await handler.execute(command('Name,Email\n Alice ,ALICE@example.com\nIncomplete,\nBob,bob@example.com'));
    expect(execute.mock.calls.map(([value]) => value)).toEqual([
      new FindOrCreateUser({ name: 'Alice', email: 'alice@example.com' }),
      new FindOrCreateUser({ name: 'Bob', email: 'bob@example.com' })
    ]);
  });

  it('performs no writes when parsing fails', async () => {
    await expect(handler.execute(command('Name,Email\n"Alice,alice@example.com'))).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops processing after a failed user write', async () => {
    execute.mockRejectedValueOnce(new Error('write failed'));
    await expect(handler.execute(command('Name,Email\nAlice,alice@example.com\nBob,bob@example.com'))).rejects.toThrow(
      'Import des utilisateurs impossible'
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves a not-found failure from the user workflow', async () => {
    execute.mockRejectedValue(new NotFoundException('Missing role'));
    await expect(handler.execute(command('Name,Email\nAlice,alice@example.com'))).rejects.toThrow(NotFoundException);
  });
});
