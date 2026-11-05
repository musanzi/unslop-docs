import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateUser } from '@api/modules/users/commands';
import { userFixture } from '@api/shared/testing/fixtures';
import { UpdatePassword } from '../impl';
import { UpdatePasswordHandler } from './update-password.handler';

describe('UpdatePasswordHandler', () => {
  let handler: UpdatePasswordHandler;
  const execute = vi.fn();
  const user = userFixture();
  const command = new UpdatePassword(user, { password: 'new-password' });

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [UpdatePasswordHandler, { provide: CommandBus, useValue: { execute } }]
    }).compile();
    handler = module.get(UpdatePasswordHandler);
  });

  it('updates the current user and returns the updated account', async () => {
    await expect(handler.execute(command)).resolves.toEqual(user);
    expect(execute).toHaveBeenCalledWith(new UpdateUser(user.id, { password: 'new-password' }));
  });

  it('translates update failures', async () => {
    execute.mockRejectedValue(new Error('write failed'));
    await expect(handler.execute(command)).rejects.toThrow('Mise à jour impossible');
  });
});
