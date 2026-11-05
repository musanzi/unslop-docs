import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../../entities';
import { DeleteUser, UpdateUser } from '../impl';
import { DeleteUserHandler } from './delete-user.handler';
import { UpdateUserHandler } from './update-user.handler';

describe('User mutations', () => {
  const user = userFixture();
  const repository = { findOneOrFail: vi.fn(), merge: vi.fn(), save: vi.fn(), softDelete: vi.fn() };
  const execute = vi.fn();
  let update: UpdateUserHandler;
  let remove: DeleteUserHandler;

  beforeEach(async () => {
    repository.findOneOrFail.mockReset().mockResolvedValue(user);
    repository.merge.mockReset().mockImplementation((entity, patch) => ({ ...entity, ...patch }));
    repository.save.mockReset().mockResolvedValue(user);
    repository.softDelete.mockReset().mockResolvedValue({ affected: 1 });
    execute.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [
        UpdateUserHandler,
        DeleteUserHandler,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: QueryBus, useValue: { execute } }
      ]
    }).compile();
    update = module.get(UpdateUserHandler);
    remove = module.get(DeleteUserHandler);
  });

  it.each([
    { roles: ['role-2'], expected: [{ id: 'role-2' }] },
    { roles: [], expected: [] }
  ])('maps explicitly supplied role IDs on update: %j', async ({ roles, expected }) => {
    await expect(update.execute(new UpdateUser(user.id, { name: 'Updated', roles }))).resolves.toEqual(user);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated', roles: expected }));
  });

  it('leaves role changes unspecified when no roles were supplied', async () => {
    await update.execute(new UpdateUser(user.id, { name: 'Updated' }));
    expect(repository.merge).toHaveBeenCalledWith(user, expect.objectContaining({ roles: undefined }));
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

  it('soft-deletes an existing account', async () => {
    await expect(remove.execute(new DeleteUser(user.id))).resolves.toBeUndefined();
    expect(repository.softDelete).toHaveBeenCalledWith(user.id);
  });

  it('does not delete a missing account and preserves the not-found error', async () => {
    execute.mockRejectedValue(new NotFoundException('missing'));
    await expect(remove.execute(new DeleteUser(user.id))).rejects.toThrow(NotFoundException);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('translates a failed deletion', async () => {
    repository.softDelete.mockRejectedValue(new Error('write failed'));
    await expect(remove.execute(new DeleteUser(user.id))).rejects.toThrow('Suppression impossible');
  });
});
