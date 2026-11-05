import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '@api/modules/users/entities';
import { SessionSerializer } from './session.serializer';

async function setup(user = userFixture({ googleSubject: 'google-1', googleEmailVerified: true })) {
  const config = new ConfigService({ ADMIN_EMAIL: 'ALICE@example.com' });
  const repository = { findOne: vi.fn().mockResolvedValue(user) };
  const module = await Test.createTestingModule({
    providers: [
      SessionSerializer,
      { provide: ConfigService, useValue: config },
      { provide: getRepositoryToken(User), useValue: repository }
    ]
  }).compile();
  return { serializer: module.get(SessionSerializer), config, module };
}

describe('Google sessions', () => {
  it.each([userFixture({ googleSubject: null }), userFixture({ googleEmailVerified: false }), null])(
    'does not restore a legacy, unverified, or missing account: %j',
    async (user) => {
      const { serializer, module } = await setup(user);
      const done = vi.fn();
      await serializer.deserializeUser('user-1', done);
      expect(done).toHaveBeenCalledWith(null, false);
      await module.close();
    }
  );

  it('stores only the account ID in the session', async () => {
    const { serializer, module } = await setup();
    const done = vi.fn();
    serializer.serializeUser({ ...userFixture(), roles: ['user'], isAdmin: true }, done);
    expect(done).toHaveBeenCalledExactlyOnceWith(null, 'user-1');
    await module.close();
  });

  it('revokes admin access in an existing session when ADMIN_EMAIL changes', async () => {
    const { serializer, config, module } = await setup();
    const done = vi.fn();
    await serializer.deserializeUser('user-1', done);
    expect(done).toHaveBeenLastCalledWith(null, expect.objectContaining({ isAdmin: true }));
    config.set('ADMIN_EMAIL', 'other@example.com');
    await serializer.deserializeUser('user-1', done);
    expect(done).toHaveBeenLastCalledWith(null, expect.objectContaining({ isAdmin: false }));
    await module.close();
  });
});
