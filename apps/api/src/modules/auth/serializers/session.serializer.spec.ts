import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { SessionSerializer } from './session.serializer';

describe('SessionSerializer', () => {
  const user = { ...userFixture({ password: undefined }), roles: ['user'] };
  const execute = vi.fn();
  const done = vi.fn();
  let serializer: SessionSerializer;

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      providers: [SessionSerializer, { provide: QueryBus, useValue: { execute } }]
    }).compile();
    serializer = module.get(SessionSerializer);
  });

  it('stores only the user ID in a session', () => {
    serializer.serializeUser(user, done);
    expect(done).toHaveBeenCalledExactlyOnceWith(null, user.id);
  });

  it('restores the current account from its stored ID', async () => {
    await serializer.deserializeUser(user.id, done);
    expect(done).toHaveBeenCalledExactlyOnceWith(null, user);
  });

  it('reports a failed account lookup to Passport without a user', async () => {
    const error = new Error('account deleted');
    execute.mockRejectedValue(error);
    await serializer.deserializeUser(user.id, done);
    expect(done).toHaveBeenCalledExactlyOnceWith(error);
  });
});
