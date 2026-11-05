import { compare } from 'bcryptjs';
import { InsertEvent, UpdateEvent } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../entities';
import { UserSubscriber } from './user.subscriber';

describe('UserSubscriber', () => {
  const subscriber = new UserSubscriber();

  it.each(['beforeInsert', 'beforeUpdate'] as const)('hashes a supplied password on %s', async (method) => {
    const entity = userFixture({ password: 'plain-password' });
    const event = { entity } as InsertEvent<User> & UpdateEvent<User>;
    await subscriber[method](event);
    expect(entity.password).not.toBe('plain-password');
    await expect(compare('plain-password', entity.password)).resolves.toBe(true);
    await expect(compare('wrong-password', entity.password)).resolves.toBe(false);
  });

  it.each(['beforeInsert', 'beforeUpdate'] as const)('leaves an absent password alone on %s', async (method) => {
    const entity = userFixture({ password: undefined });
    await subscriber[method]({ entity } as InsertEvent<User> & UpdateEvent<User>);
    expect(entity.password).toBeUndefined();
  });
});
