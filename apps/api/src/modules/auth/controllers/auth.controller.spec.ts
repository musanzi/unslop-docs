import { Injectable, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import session from 'express-session';
import passport from 'passport';
import { UsersController } from '@api/modules/users/controllers';
import { RolesController } from '@api/modules/roles/controllers';
import { StatsController } from '@api/modules/stats/controllers';
import { Role } from '@api/modules/roles/entities';
import { User } from '@api/modules/users/entities';
import { userFixture } from '@api/shared/testing/fixtures';
import { FindOrCreateUserHandler } from '@api/modules/users/commands/handlers/find-or-create-user.handler';
import { FindUsersHandler } from '@api/modules/users/queries/handlers/find-users.handler';
import { FindUserByIdHandler } from '@api/modules/users/queries/handlers/find-user-by-id.handler';
import { UpdateUserHandler } from '@api/modules/users/commands/handlers/update-user.handler';
import { AuthController } from './auth.controller';
import { AuthGuard, RolesGuard } from '../guards';
import { SignOutHandler } from '../commands/handlers/sign-out.handler';
import { UpdateProfileHandler } from '../commands/handlers/update-profile.handler';
import { GoogleStrategy } from '../strategies/google.strategy';
import { GoogleRedirectHandler } from '../queries/handlers/google-redirect.handler';
import { SessionSerializer } from '../serializers';
import { IGoogleProfile } from '../interfaces';

let googleProfile: IGoogleProfile;
const exchangeCode = vi.fn();

@Injectable()
class FakeGoogleTransport extends GoogleStrategy {
  constructor(config: ConfigService, commands: CommandBus) {
    super(config, commands);
    this._oauth2.getOAuthAccessToken = (...args: unknown[]) => {
      exchangeCode();
      const done = args.at(-1);
      if (typeof done === 'function') done(null, 'fake-access-token', 'fake-refresh-token', {});
    };
  }

  override userProfile(_token: string, done: (error: unknown, profile: IGoogleProfile) => void): void {
    done(null, googleProfile);
  }
}

describe('Google-only HTTP surface', () => {
  let app: INestApplication;
  let base: string;
  const config = new ConfigService({
    ADMIN_EMAIL: 'ADMIN@example.com',
    FRONTEND_URI: 'http://localhost:4200',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/auth/google/redirect'
  });
  let users: User[] = [];
  const builder = {
    leftJoinAndSelect: () => builder,
    orderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [users, users.length]
  };
  const repository = {
    findOne: async ({ where }) =>
      users.find((user) => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null,
    findOneOrFail: async ({ where }) => users.find((user) => user.id === where.id),
    create: (data) => userFixture({ ...data, id: `user-${users.length + 1}` }),
    save: async (user) => {
      users = [...users.filter((existing) => existing.id !== user.id), user];
      return user;
    },
    merge: (user, changes) =>
      Object.assign(user, Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))),
    createQueryBuilder: () => builder
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [CqrsModule.forRoot()],
      controllers: [AuthController, UsersController, RolesController, StatsController],
      providers: [
        AuthGuard,
        RolesGuard,
        SignOutHandler,
        GoogleRedirectHandler,
        FindOrCreateUserHandler,
        SessionSerializer,
        FindUsersHandler,
        FindUserByIdHandler,
        UpdateUserHandler,
        UpdateProfileHandler,
        { provide: GoogleStrategy, useClass: FakeGoogleTransport },
        { provide: ConfigService, useValue: config },
        { provide: getRepositoryToken(User), useValue: repository },
        {
          provide: getRepositoryToken(Role),
          useValue: { findOneByOrFail: async () => ({ id: 'role-user', name: 'user' }) }
        }
      ]
    }).compile();
    app = module.createNestApplication();
    app.use(session({ secret: 'isolated-test-session-secret', resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalGuards(module.get(AuthGuard), module.get(RolesGuard));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  beforeEach(() => {
    users = [];
    config.set('ADMIN_EMAIL', 'ADMIN@example.com');
    googleProfile = {
      id: 'google-stable-subject',
      emails: [{ value: 'alice@example.com', verified: true }],
      name: { givenName: 'Alice' }
    };
  });
  afterAll(async () => {
    await app?.close();
  });

  async function start() {
    const response = await fetch(`${base}/auth/signin/google`, { redirect: 'manual' });
    return {
      state: new URL(response.headers.get('location')).searchParams.get('state'),
      cookie: response.headers.get('set-cookie').split(';')[0]
    };
  }

  async function signIn() {
    const { state, cookie } = await start();
    const response = await fetch(`${base}/auth/google/redirect?code=fake-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie }
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:4200');
    const signedInCookie = response.headers.get('set-cookie').split(';')[0];
    expect(signedInCookie).not.toBe(cookie);
    return signedInCookie;
  }

  it('creates a user through Google, rotates the session and signs out', async () => {
    const cookie = await signIn();
    const profile = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(await profile.json()).toMatchObject({ email: 'alice@example.com', roles: ['user'], isAdmin: false });
    const out = await fetch(`${base}/auth/signout`, { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(201);
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(403);
  });

  it('allows the configured verified Google admin and revokes the same session after a configuration change', async () => {
    googleProfile.emails[0].value = 'admin@example.com';
    const cookie = await signIn();
    expect((await fetch(`${base}/users`, { headers: { cookie } })).status).toBe(200);
    config.set('ADMIN_EMAIL', 'replacement@example.com');
    expect((await fetch(`${base}/users`, { headers: { cookie } })).status).toBe(403);
    const profile = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(await profile.json()).toMatchObject({ isAdmin: false });
  });

  it('does not grant admin access through a profile email or role edit', async () => {
    const cookie = await signIn();
    const response = await fetch(`${base}/auth/me/update`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated',
        email: 'admin@example.com',
        roles: ['admin'],
        googleEmailVerified: true,
        isAdmin: true
      })
    });
    expect(await response.json()).toMatchObject({ name: 'Updated', email: 'alice@example.com', isAdmin: false });
    expect((await fetch(`${base}/users`, { headers: { cookie } })).status).toBe(403);
  });

  it.each([
    { id: 'subject', emails: [{ value: 'admin@example.com', verified: false }] },
    { id: 'subject', emails: [{ value: 'admin@example.com' }] },
    { id: '', emails: [{ value: 'admin@example.com', verified: true }] },
    { id: 'subject', emails: [] }
  ])('rejects an incomplete or unverified Google identity: %j', async (profile) => {
    googleProfile = profile;
    const { state, cookie } = await start();
    const response = await fetch(`${base}/auth/google/redirect?code=fake-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie }
    });
    expect(response.headers.get('location')).toContain('error=google-failed');
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(403);
    expect(users).toHaveLength(0);
  });

  it.each(['/users', '/users/export/csv', '/users/admin@example.com', '/roles', '/roles/role-user', '/stats'])(
    'denies %s to an ordinary Google user despite legacy admin roles',
    async (path) => {
      const cookie = await signIn();
      users[0].roles = [Object.assign(new Role(), { id: 'legacy-admin', name: 'admin' })];
      expect((await fetch(`${base}${path}`, { headers: { cookie } })).status).toBe(403);
    }
  );

  it('keeps legacy accounts separate even if their email matches Google', async () => {
    users = [userFixture({ id: 'legacy-user', googleSubject: null, googleEmailVerified: false })];
    const cookie = await signIn();
    const response = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(await response.json()).toMatchObject({ id: 'user-2', roles: ['user'] });
  });

  it('starts Google consent with an unpredictable state bound to the session', async () => {
    const first = await start();
    const second = await start();
    expect(first.state).toBeTruthy();
    expect(second.state).not.toBe(first.state);
    expect(first.cookie).toContain('connect.sid=');
  });

  it.each([
    ['error=access_denied', 'google-cancelled'],
    ['code=fake-code&state=wrong-state', 'google-failed'],
    ['code=fake-code', 'google-failed']
  ])('returns safely to sign-in for %s without exchanging a token', async (query, reason) => {
    const { cookie } = await start();
    const response = await fetch(`${base}/auth/google/redirect?${query}`, { redirect: 'manual', headers: { cookie } });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`http://localhost:4200/auth/sign-in?error=${reason}`);
    expect(exchangeCode).not.toHaveBeenCalled();
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(403);
  });

  it('rejects a callback replay after successful sign-in', async () => {
    const { cookie, state } = await start();
    const url = `${base}/auth/google/redirect?code=fake-code&state=${state}`;
    await fetch(url, { redirect: 'manual', headers: { cookie } });
    exchangeCode.mockClear();
    const replay = await fetch(url, { redirect: 'manual', headers: { cookie } });
    expect(replay.headers.get('location')).toContain('error=google-failed');
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/auth/signup'],
    ['POST', '/auth/signin'],
    ['PATCH', '/auth/password/update'],
    ['POST', '/auth/password/forgot'],
    ['POST', '/auth/password/reset'],
    ['POST', '/users'],
    ['POST', '/users/import/csv'],
    ['PATCH', '/users/test-user'],
    ['DELETE', '/users/test-user'],
    ['POST', '/roles'],
    ['PATCH', '/roles/test-role'],
    ['DELETE', '/roles/test-role']
  ])('returns 404 for removed %s %s, signed in or out', async (method, path) => {
    const cookie = await signIn();
    for (const headers of [{}, { cookie }]) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{}'
      });
      expect(response.status).toBe(404);
    }
  });
});
