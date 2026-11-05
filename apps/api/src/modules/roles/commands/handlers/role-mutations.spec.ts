import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../entities';
import { CreateRole, DeleteRole, UpdateRole } from '../impl';
import { CreateRoleHandler } from './create-role.handler';
import { DeleteRoleHandler } from './delete-role.handler';
import { UpdateRoleHandler } from './update-role.handler';

describe('Role mutations', () => {
  const role = Object.assign(new Role(), { id: 'role-1', name: 'user' });
  const repository = { create: vi.fn(), merge: vi.fn(), save: vi.fn(), delete: vi.fn() };
  const execute = vi.fn();
  let create: CreateRoleHandler;
  let update: UpdateRoleHandler;
  let remove: DeleteRoleHandler;

  beforeEach(async () => {
    repository.create.mockReset().mockReturnValue(role);
    repository.merge.mockReset().mockImplementation((entity, patch) => ({ ...entity, ...patch }));
    repository.save.mockReset().mockResolvedValue(role);
    repository.delete.mockReset().mockResolvedValue({ affected: 1 });
    execute.mockReset().mockResolvedValue(role);
    const module = await Test.createTestingModule({
      providers: [
        CreateRoleHandler,
        UpdateRoleHandler,
        DeleteRoleHandler,
        { provide: getRepositoryToken(Role), useValue: repository },
        { provide: QueryBus, useValue: { execute } }
      ]
    }).compile();
    create = module.get(CreateRoleHandler);
    update = module.get(UpdateRoleHandler);
    remove = module.get(DeleteRoleHandler);
  });

  it('returns a created role', async () => {
    await expect(create.execute(new CreateRole({ name: 'user' }))).resolves.toEqual(role);
  });

  it('translates creation failures', async () => {
    repository.save.mockRejectedValue(new Error('duplicate name'));
    await expect(create.execute(new CreateRole({ name: 'user' }))).rejects.toThrow('Création du rôle impossible');
  });

  it('saves changed role properties', async () => {
    repository.save.mockResolvedValue({ ...role, name: 'editor' });
    await expect(update.execute(new UpdateRole(role.id, { name: 'editor' }))).resolves.toMatchObject({
      name: 'editor'
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ id: role.id, name: 'editor' }));
  });

  it('does not save a missing role and preserves the not-found error', async () => {
    execute.mockRejectedValue(new NotFoundException('missing'));
    await expect(update.execute(new UpdateRole(role.id, { name: 'editor' }))).rejects.toThrow(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('translates update failures', async () => {
    repository.save.mockRejectedValue(new Error('write failed'));
    await expect(update.execute(new UpdateRole(role.id, { name: 'editor' }))).rejects.toThrow(BadRequestException);
  });

  it('deletes an existing role', async () => {
    await expect(remove.execute(new DeleteRole(role.id))).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith(role.id);
  });

  it('does not delete a missing role', async () => {
    execute.mockRejectedValue(new NotFoundException('missing'));
    await expect(remove.execute(new DeleteRole(role.id))).rejects.toThrow(NotFoundException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('translates deletion failures', async () => {
    repository.delete.mockRejectedValue(new Error('write failed'));
    await expect(remove.execute(new DeleteRole(role.id))).rejects.toThrow('Suppression du rôle impossible');
  });
});
