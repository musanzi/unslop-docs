import { BadRequestException } from '@nestjs/common';
import { EventBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { FindRoleByName } from '@api/modules/roles/queries';
import { User } from '../../entities';
import { WelcomeUserEvent } from '../../events';
import { CreateUser } from '../impl';
import { CreateUserHandler } from './create-user.handler';

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: vi.fn(() => 7)
}));

describe('CreateUserHandler', () => {
  const user = userFixture();
  const create = vi.fn();
  const save = vi.fn();
  const execute = vi.fn();
  const publish = vi.fn();
  let handler: CreateUserHandler;

  beforeEach(async () => {
    create.mockReset().mockImplementation((data) => Object.assign(new User(), data));
    save.mockReset().mockResolvedValue(user);
    execute.mockReset().mockResolvedValue(user);
    publish.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        CreateUserHandler,
        { provide: getRepositoryToken(User), useValue: { create, save } },
        { provide: QueryBus, useValue: { execute } },
        { provide: EventBus, useValue: { publish } }
      ]
    }).compile();
    handler = module.get(CreateUserHandler);
  });

  it('assigns supplied role IDs and does not email a supplied password', async () => {
    await expect(
      handler.execute(
        new CreateUser({ name: user.name, email: user.email, password: 'chosen-password', roles: ['role-2'] })
      )
    ).resolves.toEqual(user);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'chosen-password', roles: [{ id: 'role-2' }] })
    );
    expect(publish).toHaveBeenCalledWith(new WelcomeUserEvent(user, undefined));
    expect(execute).not.toHaveBeenCalledWith(new FindRoleByName('user'));
  });

  it.each([undefined, ''])(
    'uses the generated password for both storage and the welcome event when supplied password is %j',
    async (password) => {
      const role = { id: 'role-1', name: 'user' };
      execute.mockResolvedValueOnce(role).mockResolvedValueOnce(user);
      await expect(handler.execute(new CreateUser({ name: user.name, email: user.email, password }))).resolves.toEqual(
        user
      );
      expect(execute).toHaveBeenCalledWith(new FindRoleByName('user'));
      const saved = save.mock.calls[0][0];
      expect(saved.roles).toEqual([role]);
      expect(saved.password).toBe('000007');
      expect(publish).toHaveBeenCalledWith(new WelcomeUserEvent(user, saved.password));
    }
  );

  it('preserves an explicitly empty role list', async () => {
    await handler.execute(new CreateUser({ name: user.name, email: user.email, roles: [] }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ roles: [] }));
    expect(execute).not.toHaveBeenCalledWith(new FindRoleByName('user'));
  });

  it('does not persist or publish an account if default-role lookup fails', async () => {
    execute.mockRejectedValue(new Error('missing role'));
    await expect(handler.execute(new CreateUser({ name: user.name, email: user.email }))).rejects.toThrow(
      BadRequestException
    );
    expect(save).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish a welcome event if saving fails', async () => {
    save.mockRejectedValue(new Error('duplicate email'));
    await expect(handler.execute(new CreateUser({ name: user.name, email: user.email, roles: [] }))).rejects.toThrow(
      "Création de l'utilisateur impossible"
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
