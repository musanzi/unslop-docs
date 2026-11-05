import { UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindUserByEmail } from '@api/modules/users/queries';
import { ValidateCredentials } from '../impl';
import { ValidateCredentialsHandler } from './validate-credentials.handler';

describe('ValidateCredentialsHandler', () => {
  const password = hashSync('correct-password', 4);
  const execute = vi.fn();
  let handler: ValidateCredentialsHandler;

  beforeEach(async () => {
    execute.mockReset();
    const module = await Test.createTestingModule({
      providers: [ValidateCredentialsHandler, { provide: QueryBus, useValue: { execute } }]
    }).compile();
    handler = module.get(ValidateCredentialsHandler);
  });

  it('returns the public user after validating credentials', async () => {
    const user = { id: 'user-1', email: 'user@example.com', roles: ['user'] };
    execute.mockResolvedValueOnce({ ...user, password }).mockResolvedValueOnce(user);

    await expect(handler.execute(new ValidateCredentials(user.email, 'correct-password'))).resolves.toEqual(user);
    expect(execute).toHaveBeenLastCalledWith(new FindUserByEmail(user.email));
  });

  it.each([null, {}, { password: '' }, { password }])('rejects missing or incorrect credentials: %j', async (user) => {
    execute.mockResolvedValueOnce(user);

    await expect(handler.execute(new ValidateCredentials('user@example.com', 'wrong-password'))).rejects.toThrow(
      UnauthorizedException
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not expose lookup failures', async () => {
    execute.mockRejectedValue(new Error('database details'));

    await expect(handler.execute(new ValidateCredentials('user@example.com', 'password'))).rejects.toThrow(
      'Les identifiants saisis sont invalides'
    );
  });

  it('rejects a failed public-user lookup after password validation', async () => {
    execute.mockResolvedValueOnce({ password }).mockRejectedValueOnce(new Error('lookup failed'));

    await expect(handler.execute(new ValidateCredentials('user@example.com', 'correct-password'))).rejects.toThrow(
      UnauthorizedException
    );
  });
});
