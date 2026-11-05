import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, QueryBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { ForgotPassword } from '../impl';
import { ResetPasswordRequestedEvent } from '../../events';
import { ForgotPasswordHandler } from './forgot-password.handler';

describe('ForgotPasswordHandler', () => {
  const user = userFixture();
  let handler: ForgotPasswordHandler;
  const execute = vi.fn();
  const publish = vi.fn();
  const signAsync = vi.fn();

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(user);
    publish.mockReset();
    signAsync.mockReset().mockResolvedValue('reset-token');
    const module = await Test.createTestingModule({
      providers: [
        ForgotPasswordHandler,
        { provide: QueryBus, useValue: { execute } },
        { provide: EventBus, useValue: { publish } },
        { provide: JwtService, useValue: { signAsync } },
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: 'test-secret', FRONTEND_URI: 'https://web.example' })
        }
      ]
    }).compile();
    handler = module.get(ForgotPasswordHandler);
  });

  it('publishes a reset link backed by a short-lived token for the user', async () => {
    await handler.execute(new ForgotPassword({ email: user.email }));
    expect(signAsync).toHaveBeenCalledWith(
      { sub: user.id, name: user.name, email: user.email },
      { secret: 'test-secret', expiresIn: '15m' }
    );
    expect(publish).toHaveBeenCalledWith(
      new ResetPasswordRequestedEvent(user, 'https://web.example/auth/reset-password?token=reset-token')
    );
  });

  it('does not issue a token or publish mail when the user lookup fails', async () => {
    execute.mockRejectedValue(new Error('missing user'));
    await expect(handler.execute(new ForgotPassword({ email: user.email }))).rejects.toThrow(BadRequestException);
    expect(signAsync).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish mail when token creation fails', async () => {
    signAsync.mockRejectedValue(new Error('signing failed'));
    await expect(handler.execute(new ForgotPassword({ email: user.email }))).rejects.toThrow('Demande invalide');
    expect(publish).not.toHaveBeenCalled();
  });
});
