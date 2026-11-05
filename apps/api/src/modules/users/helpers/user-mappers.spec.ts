import { describe, expect, it } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { Role } from '@api/modules/roles/entities';
import { mapUserRoles } from './user-mappers';

describe('Account roles', () => {
  it('assigns admin to the verified configured email regardless of casing', () => {
    const user = userFixture({ email: 'ADMIN@example.com' });
    expect(mapUserRoles(user, ' admin@EXAMPLE.com ')).toMatchObject({ roles: ['admin'], isAdmin: true });
  });

  it.each([
    userFixture(),
    userFixture({ email: 'admin@example.com', googleEmailVerified: false }),
    userFixture({ email: 'admin@example.com', googleSubject: null }),
    userFixture({ roles: [Object.assign(new Role(), { name: 'admin' })] })
  ])('defaults to user unless the verified identity matches the admin email: %j', (user) => {
    expect(mapUserRoles(user, 'admin@example.com')).toMatchObject({ roles: ['user'], isAdmin: false });
  });

  it('does not assign admin when the configured email is empty', () => {
    expect(mapUserRoles(userFixture({ email: '' }), ' ')).toMatchObject({ roles: ['user'], isAdmin: false });
  });
});
