import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../../entities';
import { FindUserByEmail, FindUserById, FindUsers } from '../impl';
import { FindUserByEmailHandler } from './find-user-by-email.handler';
import { FindUserByIdHandler } from './find-user-by-id.handler';
import { FindUsersHandler } from './find-users.handler';

describe('User queries', () => {
  const user = userFixture();
  const publicUser = {
    id: user.id,
    name: 'Alice',
    status: 'FREE',
    email: 'alice@example.com',
    avatar: null,
    roles: ['user'],
    isAdmin: false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: undefined
  };
  const builder = {
    where: vi.fn().mockReturnThis(),
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getOneOrFail: vi.fn(),
    getManyAndCount: vi.fn()
  };
  const repository = { findOneOrFail: vi.fn(), createQueryBuilder: vi.fn() };
  let byId: FindUserByIdHandler;
  let byEmail: FindUserByEmailHandler;
  let list: FindUsersHandler;

  beforeEach(async () => {
    repository.findOneOrFail.mockReset().mockResolvedValue(user);
    repository.createQueryBuilder.mockReset().mockReturnValue(builder);
    builder.getOneOrFail.mockReset().mockResolvedValue(user);
    builder.getManyAndCount.mockReset().mockResolvedValue([[user], 12]);
    const module = await Test.createTestingModule({
      providers: [
        FindUserByIdHandler,
        FindUserByEmailHandler,
        FindUsersHandler,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: ConfigService, useValue: new ConfigService({ ADMIN_EMAIL: 'admin@example.com' }) }
      ]
    }).compile();
    byId = module.get(FindUserByIdHandler);
    byEmail = module.get(FindUserByEmailHandler);
    list = module.get(FindUsersHandler);
  });

  it('maps role entities to public role names for an ID lookup', async () => {
    await expect(byId.execute(new FindUserById(user.id))).resolves.toEqual(publicUser);
  });

  it('returns the user role without relying on legacy role assignments', async () => {
    repository.findOneOrFail.mockResolvedValue(userFixture({ roles: undefined }));
    await expect(byId.execute(new FindUserById(user.id))).resolves.toMatchObject({ roles: ['user'] });
  });

  it('returns a public profile without provider identity fields', async () => {
    await expect(byEmail.execute(new FindUserByEmail(user.email))).resolves.toEqual(publicUser);
    expect(builder.addSelect).not.toHaveBeenCalled();
  });

  it('reports failed ID and email lookups as not found', async () => {
    repository.findOneOrFail.mockRejectedValue(new Error('missing'));
    builder.getOneOrFail.mockRejectedValue(new Error('missing'));
    await expect(byId.execute(new FindUserById('missing'))).rejects.toThrow(NotFoundException);
    await expect(byEmail.execute(new FindUserByEmail('missing@example.com'))).rejects.toThrow(NotFoundException);
  });

  it('returns mapped users with the total count and default page size', async () => {
    await expect(list.execute(new FindUsers({}))).resolves.toEqual([[publicUser], 12]);
    expect(builder.skip).toHaveBeenCalledWith(0);
    expect(builder.take).toHaveBeenCalledWith(20);
    expect(builder.where).not.toHaveBeenCalled();
  });

  it('uses the requested page and search term', async () => {
    await list.execute(new FindUsers({ q: 'Alice', page: 3, take: 5 }));
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(5);
    expect(builder.where).toHaveBeenCalledWith(expect.any(String), { q: '%Alice%' });
  });

  it('rejects invalid pagination before querying', async () => {
    await expect(list.execute(new FindUsers({ page: 0 }))).rejects.toThrow('Invalid pagination parameters');
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('translates list query failures', async () => {
    builder.getManyAndCount.mockRejectedValue(new Error('query failed'));
    await expect(list.execute(new FindUsers({}))).rejects.toThrow(BadRequestException);
  });
});
