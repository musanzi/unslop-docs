import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { Role } from '@api/modules/roles/entities';
import { User } from '../../entities';
import { FindOrCreateUser } from '../impl';
import { FindOrCreateUserHandler } from './find-or-create-user.handler';

const identity = {
  subject: 'google-subject-1',
  email: 'alice@example.com',
  emailVerified: true,
  name: 'Alice',
  avatar: 'google.png'
};

describe('Google account creation', () => {
  it('keeps the account ID when the same Google subject changes email', async () => {
    let saved = userFixture({ googleSubject: identity.subject, googleEmailVerified: true });
    const repository = {
      findOne: vi.fn(async ({ where }) => (where.googleSubject === saved.googleSubject ? saved : null)),
      create: vi.fn((data) => userFixture(data)),
      save: vi.fn(async (data) => {
        saved = data;
        return saved;
      })
    };
    const module = await Test.createTestingModule({
      imports: [CqrsModule.forRoot()],
      providers: [
        FindOrCreateUserHandler,
        { provide: ConfigService, useValue: new ConfigService({ ADMIN_EMAIL: 'admin@example.com' }) },
        { provide: getRepositoryToken(User), useValue: repository },
        {
          provide: getRepositoryToken(Role),
          useValue: { findOneByOrFail: vi.fn().mockResolvedValue({ id: 'role-user', name: 'user' }) }
        }
      ]
    }).compile();
    const result = await module
      .get(FindOrCreateUserHandler)
      .execute(new FindOrCreateUser({ ...identity, email: 'changed@example.com' }));
    expect(result).toMatchObject({ id: 'user-1', email: 'changed@example.com', roles: ['user'] });
    expect(repository.create).not.toHaveBeenCalled();
    await module.close();
  });
});
