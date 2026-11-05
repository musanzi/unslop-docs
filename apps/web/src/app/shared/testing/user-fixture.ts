import type { IUserResponse } from '@unslop-docs/api-contracts';

export const testUser: IUserResponse = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  roles: ['user'],
  isAdmin: false,
  status: 'FREE',
  createdAt: '2026-11-05T12:00:00Z',
  updatedAt: '2026-11-05T12:00:00Z'
};
