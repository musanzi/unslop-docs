import { User } from '@api/modules/users/entities';
import { Role } from '@api/modules/roles/entities';

export function userFixture(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'hashed-password',
    avatar: null,
    roles: [Object.assign(new Role(), { id: 'role-1', name: 'user' })],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  });
}
