import { BadRequestException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../../entities';
import { UpdateUser } from '../impl';
import { UpdateUserHandler } from './update-user.handler';

describe('User mutations', () => {
  const user = userFixture();
  const repository = { findOneOrFail: vi.fn(), merge: vi.fn(), save: vi.fn(), softDelete: vi.fn() };
  const execute = vi.fn();
  let update: UpdateUserHandler;

  beforeEach(async () => {
    repository.findOneOrFail.mockReset().mockResolvedValue(user);
    repository.merge.mockReset().mockImplementation((entity, patch) => ({ ...entity, ...patch }));
    repository.save.mockReset().mockResolvedValue(user);
    repository.softDelete.mockReset().mockResolvedValue({ affected: 1 });
    execute.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [
        UpdateUserHandler,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: QueryBus, useValue: { execute } }
      ]
    }).compile();
    update = module.get(UpdateUserHandler);
  });

  it('rejects an absent ID before lookup or writing', async () => {
    await expect(update.execute(new UpdateUser('', { name: 'Updated' }))).rejects.toThrow(BadRequestException);
    expect(repository.findOneOrFail).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not save when the account lookup fails', async () => {
    repository.findOneOrFail.mockRejectedValue(new Error('missing'));
    await expect(update.execute(new UpdateUser(user.id, {}))).rejects.toThrow('Mise à jour impossible');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not refresh the account if saving fails', async () => {
    repository.save.mockRejectedValue(new Error('write failed'));
    await expect(update.execute(new UpdateUser(user.id, {}))).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });
});
