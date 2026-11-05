import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { UpdateUser } from '@api/modules/users/commands';
import { UpdateProfile } from '../impl';
import { UpdateProfileHandler } from './update-profile.handler';

describe('Account workflows', () => {
  const user = userFixture();
  const executeCommand = vi.fn();
  const executeQuery = vi.fn();
  let update: UpdateProfileHandler;

  beforeEach(async () => {
    executeCommand.mockReset().mockResolvedValue(user);
    executeQuery.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [
        UpdateProfileHandler,
        { provide: CommandBus, useValue: { execute: executeCommand } },
        { provide: QueryBus, useValue: { execute: executeQuery } }
      ]
    }).compile();
    update = module.get(UpdateProfileHandler);
  });

  it('limits profile edits to the current user name without changing Google identity or access', async () => {
    const input = { name: 'Updated', email: 'new@example.com', roles: ['admin'], password: 'injected' };
    await expect(
      update.execute(new UpdateProfile({ ...user, roles: ['user'], isAdmin: false }, input))
    ).resolves.toEqual(user);
    expect(executeCommand).toHaveBeenCalledWith(new UpdateUser(user.id, { name: 'Updated' }));
  });

  it('translates profile write failures', async () => {
    executeCommand.mockRejectedValue(new Error('write failed'));
    await expect(
      update.execute(new UpdateProfile({ ...user, roles: ['user'], isAdmin: false }, { name: 'Updated' }))
    ).rejects.toThrow('Requête invalide');
  });
});
