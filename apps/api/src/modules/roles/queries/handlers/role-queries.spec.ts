import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../entities';
import { FindRoleById, FindRoleByName, FindRoles } from '../impl';
import { FindRoleByIdHandler } from './find-role-by-id.handler';
import { FindRoleByNameHandler } from './find-role-by-name.handler';
import { FindRolesHandler } from './find-roles.handler';

describe('Role queries', () => {
  const role = Object.assign(new Role(), { id: 'role-1', name: 'user' });
  const builder = {
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn()
  };
  const repository = { findOneOrFail: vi.fn(), findAndCount: vi.fn(), createQueryBuilder: vi.fn() };
  let byId: FindRoleByIdHandler;
  let byName: FindRoleByNameHandler;
  let list: FindRolesHandler;

  beforeEach(async () => {
    repository.findOneOrFail.mockReset().mockResolvedValue(role);
    repository.findAndCount.mockReset().mockResolvedValue([[role], 1]);
    repository.createQueryBuilder.mockReset().mockReturnValue(builder);
    builder.getManyAndCount.mockReset().mockResolvedValue([[role], 12]);
    const module = await Test.createTestingModule({
      providers: [
        FindRoleByIdHandler,
        FindRoleByNameHandler,
        FindRolesHandler,
        { provide: getRepositoryToken(Role), useValue: repository }
      ]
    }).compile();
    byId = module.get(FindRoleByIdHandler);
    byName = module.get(FindRoleByNameHandler);
    list = module.get(FindRolesHandler);
  });

  it('finds a role by its ID', async () => {
    await expect(byId.execute(new FindRoleById(role.id))).resolves.toEqual(role);
    expect(repository.findOneOrFail).toHaveBeenCalledWith({ where: { id: role.id } });
  });

  it('finds the default role by name', async () => {
    await expect(byName.execute(new FindRoleByName('user'))).resolves.toEqual(role);
    expect(repository.findOneOrFail).toHaveBeenCalledWith({ where: { name: 'user' } });
  });

  it('reports missing ID and name lookups consistently', async () => {
    repository.findOneOrFail.mockRejectedValue(new Error('not found'));
    await expect(byId.execute(new FindRoleById('missing'))).rejects.toThrow(NotFoundException);
    await expect(byName.execute(new FindRoleByName('missing'))).rejects.toThrow(NotFoundException);
  });

  it('returns all roles when no filtering or pagination was requested', async () => {
    await expect(list.execute(new FindRoles({}))).resolves.toEqual([[role], 1]);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('applies page offsets and a bound search term to filtered results', async () => {
    await expect(list.execute(new FindRoles({ q: 'us', page: 3, limit: 5 }))).resolves.toEqual([[role], 12]);
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(5);
    expect(builder.where).toHaveBeenCalledWith(expect.any(String), { name: '%us%' });
  });

  it('rejects invalid pagination before querying', async () => {
    await expect(list.execute(new FindRoles({ limit: 101 }))).rejects.toThrow(
      'Les paramètres de pagination sont invalides'
    );
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('translates query failures in both list branches', async () => {
    repository.findAndCount.mockRejectedValue(new Error('query failed'));
    builder.getManyAndCount.mockRejectedValue(new Error('query failed'));
    await expect(list.execute(new FindRoles({}))).rejects.toThrow(BadRequestException);
    await expect(list.execute(new FindRoles({ page: 1 }))).rejects.toThrow('Rôles introuvables');
  });
});
