import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../../entities';
import { CreateUser, FindOrCreateUser, UpdateUser } from '../impl';
import { FindOrCreateUserHandler } from './find-or-create-user.handler';

describe('FindOrCreateUserHandler', () => {
  let handler: FindOrCreateUserHandler;
  const execute = vi.fn();
  const findOne = vi.fn();
  const dto = { email: 'alice@example.com', name: 'Alice', avatar: 'provider-avatar.png' };
  const user = userFixture();

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(user);
    findOne.mockReset().mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        FindOrCreateUserHandler,
        { provide: CommandBus, useValue: { execute } },
        { provide: getRepositoryToken(User), useValue: { findOne } }
      ]
    }).compile();
    handler = module.get(FindOrCreateUserHandler);
  });

  it('creates an account when no matching user exists', async () => {
    await expect(handler.execute(new FindOrCreateUser(dto))).resolves.toEqual(user);
    expect(execute).toHaveBeenCalledWith(new CreateUser(dto));
  });

  it.each(['custom-avatar.png', null])('preserves an existing avatar when updating: %s', async (avatar) => {
    findOne.mockResolvedValue(userFixture({ avatar }));
    await expect(handler.execute(new FindOrCreateUser(dto))).resolves.toEqual(user);
    expect(execute).toHaveBeenCalledWith(
      new UpdateUser(user.id, {
        email: dto.email,
        name: dto.name,
        password: undefined,
        avatar: avatar ? undefined : dto.avatar,
        roles: undefined
      })
    );
  });

  it('does not dispatch a write after a lookup failure', async () => {
    findOne.mockRejectedValue(new Error('lookup failed'));
    await expect(handler.execute(new FindOrCreateUser(dto))).rejects.toThrow('Requête invalide');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([null, user])('translates failed creation and failed updates: %j', async (existing) => {
    findOne.mockResolvedValue(existing);
    execute.mockRejectedValue(new Error('write failed'));
    await expect(handler.execute(new FindOrCreateUser(dto))).rejects.toThrow('Requête invalide');
  });
});
