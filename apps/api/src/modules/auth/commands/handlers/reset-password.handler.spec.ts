import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateUser } from '@api/modules/users/commands';
import { userFixture } from '@api/shared/testing/fixtures';
import { ResetPassword } from '../impl';
import { ResetPasswordHandler } from './reset-password.handler';

describe('ResetPasswordHandler', () => {
  let handler: ResetPasswordHandler;
  const execute = vi.fn();
  const verifyAsync = vi.fn();
  const command = new ResetPassword({ token: 'reset-token', password: 'new-password' });
  const user = userFixture();

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(user);
    verifyAsync.mockReset().mockResolvedValue({ sub: user.id });
    const module = await Test.createTestingModule({
      providers: [
        ResetPasswordHandler,
        { provide: CommandBus, useValue: { execute } },
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'test-secret' }) }
      ]
    }).compile();
    handler = module.get(ResetPasswordHandler);
  });

  it('updates only the user identified by a verified token', async () => {
    await expect(handler.execute(command)).resolves.toEqual(user);
    expect(verifyAsync).toHaveBeenCalledWith('reset-token', { secret: 'test-secret' });
    expect(execute).toHaveBeenCalledWith(new UpdateUser(user.id, { password: 'new-password' }));
  });

  it('does not update a password for an invalid or expired token', async () => {
    verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('translates a failed password update', async () => {
    execute.mockRejectedValue(new Error('write failed'));
    await expect(handler.execute(command)).rejects.toThrow('Mot de passe invalide');
  });
});
