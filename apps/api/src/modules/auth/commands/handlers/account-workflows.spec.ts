import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { CreateUser, UpdateUser } from '@api/modules/users/commands';
import { SignUp, UpdateProfile } from '../impl';
import { SignUpHandler } from './sign-up.handler';
import { UpdateProfileHandler } from './update-profile.handler';

describe('Account workflows', () => {
  const user = userFixture();
  const executeCommand = vi.fn();
  const executeQuery = vi.fn();
  let signUp: SignUpHandler;
  let update: UpdateProfileHandler;

  beforeEach(async () => {
    executeCommand.mockReset().mockResolvedValue(user);
    executeQuery.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [
        SignUpHandler,
        UpdateProfileHandler,
        { provide: CommandBus, useValue: { execute: executeCommand } },
        { provide: QueryBus, useValue: { execute: executeQuery } }
      ]
    }).compile();
    signUp = module.get(SignUpHandler);
    update = module.get(UpdateProfileHandler);
  });

  it('limits public signup input to name, email and password', async () => {
    const input = { email: user.email, name: user.name, password: 'chosen-password', roles: ['admin'] };
    await expect(signUp.execute(new SignUp(input))).resolves.toEqual(user);
    expect(executeCommand).toHaveBeenCalledWith(
      new CreateUser({ email: user.email, name: user.name, password: 'chosen-password' })
    );
  });

  it('does not read an account after creation fails', async () => {
    executeCommand.mockRejectedValue(new Error('Email already exists'));
    await expect(
      signUp.execute(new SignUp({ email: user.email, name: user.name, password: 'chosen-password' }))
    ).rejects.toThrow('Email already exists');
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('limits profile edits to the current user name and email', async () => {
    const input = { name: 'Updated', email: 'new@example.com', roles: ['admin'], password: 'injected' };
    await expect(update.execute(new UpdateProfile(user, input))).resolves.toEqual(user);
    expect(executeCommand).toHaveBeenCalledWith(new UpdateUser(user.id, { name: 'Updated', email: 'new@example.com' }));
  });

  it('translates profile write failures', async () => {
    executeCommand.mockRejectedValue(new Error('write failed'));
    await expect(update.execute(new UpdateProfile(user, { name: 'Updated' }))).rejects.toThrow('Requête invalide');
  });
});
