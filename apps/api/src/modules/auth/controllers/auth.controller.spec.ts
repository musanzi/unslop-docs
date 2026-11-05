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
import { StatusChange, User } from '@api/modules/users/entities';
import { UpdateStatusHandler } from '@api/modules/users/commands/handlers/update-status.handler';
import { FindStatusChangesHandler } from '@api/modules/users/queries/handlers/find-status-changes.handler';
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
  let changes: StatusChange[] = [];
  let beforeUserWrite: (() => Promise<void>) | undefined;
  let failAudit = false;
  let failCommit = false;
  const historyRepository = {
    find: async ({ where, order }) =>
      changes
        .filter((change) => change.userId === where.userId)
        .sort((a, b) => {
          const time = a.createdAt.getTime() - b.createdAt.getTime();
          return (
            (order.createdAt === 'DESC' ? -time : time) ||
            (order.id === 'DESC' ? Number(b.id) - Number(a.id) : Number(a.id) - Number(b.id))
          );
        })
  };
  const builder = {
    leftJoinAndSelect: () => builder,
    orderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [users, users.length]
  };
  const repository = {
    existsBy: async ({ id }) => users.some((user) => user.id === id),
    manager: {
      transaction: async (work) => {
        const pendingUsers = users.map((user) => ({ ...user }));
        const pendingChanges = [...changes];
        const transactionalUsers = {
          findOne: async ({ where }) => pendingUsers.find((user) => user.id === where.id) ?? null,
          findOneByOrFail: async ({ id }) => pendingUsers.find((user) => user.id === id),
          update: async (id, patch) =>
            Object.assign(
              pendingUsers.find((user) => user.id === id),
              patch
            )
        };
        const transactionalChanges = {
          create: (data) => Object.assign(new StatusChange(), data),
          save: async (change) => {
            if (failAudit) throw new Error('Audit storage unavailable');
            pendingChanges.push({ ...change, id: String(pendingChanges.length + 1), createdAt: new Date() });
          }
        };
        const result = await work({
          getRepository: (entity) => (entity === User ? transactionalUsers : transactionalChanges)
        });
        if (failCommit) throw new Error('Commit failed');
        users = pendingUsers;
        changes = pendingChanges;
        return result;
      }
    },
    findOne: async ({ where }) =>
      users.find((user) => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null,
    findOneOrFail: async ({ where }) => users.find((user) => user.id === where.id),
    create: (data) => userFixture({ ...data, id: `user-${users.length + 1}` }),
    save: async (user) => {
      await beforeUserWrite?.();
      const saved = { ...users.find((existing) => existing.id === user.id), ...user };
      users = [...users.filter((existing) => existing.id !== user.id), saved];
      return saved;
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
        UpdateStatusHandler,
        FindStatusChangesHandler,
        FindUserByIdHandler,
        UpdateUserHandler,
        UpdateProfileHandler,
        { provide: GoogleStrategy, useClass: FakeGoogleTransport },
        { provide: ConfigService, useValue: config },
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: getRepositoryToken(StatusChange), useValue: historyRepository },
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
    changes = [];
    beforeUserWrite = undefined;
    failAudit = false;
    failCommit = false;
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
    expect(response.headers.get('location')).toBe('http://localhost:4200/user/documents');
    const signedInCookie = response.headers.get('set-cookie').split(';')[0];
    expect(signedInCookie).not.toBe(cookie);
    return signedInCookie;
  }

  it('creates a user through Google, rotates the session and signs out', async () => {
    const cookie = await signIn();
    const profile = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(await profile.json()).toMatchObject({
      email: 'alice@example.com',
      roles: ['user'],
      isAdmin: false,
      status: 'FREE'
    });
    const out = await fetch(`${base}/auth/signout`, { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(201);
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(401);
  });

  it('lets the admin change status and read the recorded change through the API', async () => {
    const userCookie = await signIn();
    googleProfile = { ...googleProfile, id: 'admin-subject', emails: [{ value: 'admin@example.com', verified: true }] };
    const cookie = await signIn();
    const before = Date.now();
    const response = await fetch(`${base}/users/user-1/status`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PREMIUM', adminId: 'forged-admin' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'user-1', status: 'PREMIUM' });
    const history = await fetch(`${base}/users/user-1/status-changes`, { headers: { cookie } });
    expect(history.status).toBe(200);
    const changes = await history.json();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      userId: 'user-1',
      adminId: 'user-2',
      adminEmail: 'admin@example.com',
      previousStatus: 'FREE',
      newStatus: 'PREMIUM'
    });
    expect(Date.parse(changes[0].createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(changes[0].createdAt)).toBeLessThanOrEqual(Date.now());
    expect(await (await fetch(`${base}/auth/me`, { headers: { cookie: userCookie } })).json()).toMatchObject({
      status: 'PREMIUM'
    });
    const list = await (await fetch(`${base}/users`, { headers: { cookie } })).json();
    expect(list[0]).toContainEqual(expect.objectContaining({ id: 'user-1', status: 'PREMIUM' }));
  });

  async function adminSession() {
    const userCookie = await signIn();
    googleProfile = { ...googleProfile, id: 'admin-subject', emails: [{ value: 'admin@example.com', verified: true }] };
    return { userCookie, cookie: await signIn() };
  }

  async function changeStatus(cookie: string, status: unknown, id = 'user-1') {
    return fetch(`${base}/users/${id}/status`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
  }

  async function statusHistory(cookie: string, id = 'user-1') {
    return fetch(`${base}/users/${id}/status-changes`, { headers: { cookie } });
  }

  it('suppresses unchanged statuses and returns all changes newest first for only the requested user', async () => {
    const { cookie } = await adminSession();
    expect(await (await statusHistory(cookie)).json()).toEqual([]);
    expect((await changeStatus(cookie, 'FREE')).status).toBe(200);
    expect(await (await statusHistory(cookie)).json()).toEqual([]);
    for (const status of ['PREMIUM', 'GOLD', 'FREE']) {
      expect((await changeStatus(cookie, status)).status).toBe(200);
      expect((await changeStatus(cookie, status)).status).toBe(200);
    }
    expect((await changeStatus(cookie, 'GOLD', 'user-2')).status).toBe(200);
    const history = await (await statusHistory(cookie)).json();
    expect(history.map(({ previousStatus, newStatus }) => [previousStatus, newStatus])).toEqual([
      ['GOLD', 'FREE'],
      ['PREMIUM', 'GOLD'],
      ['FREE', 'PREMIUM']
    ]);
  });

  it.each(['audit', 'commit'])('preserves the previous status and history when %s fails', async (failure) => {
    const { cookie, userCookie } = await adminSession();
    expect((await changeStatus(cookie, 'PREMIUM')).status).toBe(200);
    const historyBefore = await (await statusHistory(cookie)).json();
    failAudit = failure === 'audit';
    failCommit = failure === 'commit';
    expect((await changeStatus(cookie, 'GOLD')).status).toBe(500);
    expect(await (await statusHistory(cookie)).json()).toEqual(historyBefore);
    expect(await (await fetch(`${base}/auth/me`, { headers: { cookie: userCookie } })).json()).toMatchObject({
      status: 'PREMIUM'
    });
  });

  it('allows direct user details only for the current admin', async () => {
    const { cookie, userCookie } = await adminSession();
    const url = `${base}/users/by-id/user-1`;
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { cookie: userCookie } })).status).toBe(403);
    const response = await fetch(url, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'user-1', status: 'FREE' });
    expect((await fetch(`${base}/users/by-id/missing-user`, { headers: { cookie } })).status).toBe(404);
    config.set('ADMIN_EMAIL', 'replacement@example.com');
    expect((await fetch(url, { headers: { cookie } })).status).toBe(403);
  });

  it('rejects non-admin status edits and history reads with 403 and leaves status unchanged', async () => {
    const { cookie, userCookie } = await adminSession();
    expect((await changeStatus(userCookie, 'GOLD')).status).toBe(403);
    expect((await statusHistory(userCookie)).status).toBe(403);
    config.set('ADMIN_EMAIL', 'replacement@example.com');
    expect((await changeStatus(cookie, 'GOLD')).status).toBe(403);
    expect((await statusHistory(cookie)).status).toBe(403);
    config.set('ADMIN_EMAIL', 'admin@example.com');
    expect(await (await statusHistory(cookie)).json()).toEqual([]);
    expect(await (await fetch(`${base}/auth/me`, { headers: { cookie: userCookie } })).json()).toMatchObject({
      status: 'FREE'
    });
  });

  it.each(['PLATINUM', 'gold', '', null, 1])('rejects invalid status %j without a change', async (status) => {
    const { cookie } = await adminSession();
    expect((await changeStatus(cookie, status)).status).toBe(400);
    expect(await (await statusHistory(cookie)).json()).toEqual([]);
  });

  it('returns 404 for status operations on an unknown user', async () => {
    const { cookie } = await adminSession();
    expect((await changeStatus(cookie, 'GOLD', '00000000-0000-4000-8000-000000000099')).status).toBe(404);
    expect((await statusHistory(cookie, '00000000-0000-4000-8000-000000000099')).status).toBe(404);
  });

  it('preserves an assigned status through profile edits and repeated Google sign-in', async () => {
    const { cookie, userCookie } = await adminSession();
    expect((await changeStatus(cookie, 'GOLD')).status).toBe(200);
    const profile = await fetch(`${base}/auth/me/update`, {
      method: 'PATCH',
      headers: { cookie: userCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated', status: 'FREE' })
    });
    expect(await profile.json()).toMatchObject({ name: 'Updated', status: 'GOLD' });
    googleProfile = { id: 'google-stable-subject', emails: [{ value: 'new-email@example.com', verified: true }] };
    const signedInAgain = await signIn();
    expect(await (await fetch(`${base}/auth/me`, { headers: { cookie: signedInAgain } })).json()).toMatchObject({
      id: 'user-1',
      status: 'GOLD'
    });
    expect(await (await statusHistory(cookie)).json()).toHaveLength(1);
  });

  it.each(['profile', 'sign-in'])(
    'does not overwrite an admin change during a concurrent %s write',
    async (operation) => {
      const { cookie, userCookie } = await adminSession();
      beforeUserWrite = async () => {
        beforeUserWrite = undefined;
        expect((await changeStatus(cookie, 'GOLD')).status).toBe(200);
      };
      if (operation === 'profile') {
        const response = await fetch(`${base}/auth/me/update`, {
          method: 'PATCH',
          headers: { cookie: userCookie, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' })
        });
        expect(response.status).toBe(200);
      } else {
        googleProfile = { id: 'google-stable-subject', emails: [{ value: 'alice@example.com', verified: true }] };
        await signIn();
      }
      expect(await (await fetch(`${base}/auth/me`, { headers: { cookie: userCookie } })).json()).toMatchObject({
        status: 'GOLD'
      });
      expect(await (await statusHistory(cookie)).json()).toHaveLength(1);
    }
  );

  it('allows the configured verified Google admin and revokes the same session after a configuration change', async () => {
    googleProfile.emails[0].value = 'admin@example.com';
    const cookie = await signIn();
    expect((await fetch(`${base}/users`, { headers: { cookie } })).status).toBe(200);
    expect(await (await fetch(`${base}/auth/me`, { headers: { cookie } })).json()).toMatchObject({
      isAdmin: true,
      roles: ['admin']
    });
    config.set('ADMIN_EMAIL', 'replacement@example.com');
    expect((await fetch(`${base}/users`, { headers: { cookie } })).status).toBe(403);
    const profile = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(await profile.json()).toMatchObject({ isAdmin: false, roles: ['user'] });
  });

  it('reports the admin role in user listings, details, profile edits, and status edits', async () => {
    const { cookie } = await adminSession();
    const admin = { id: 'user-2', roles: ['admin'], isAdmin: true };
    const headers = { cookie, 'content-type': 'application/json' };
    const listing = await fetch(`${base}/users`, { headers });
    expect(await listing.json()).toEqual([
      [expect.objectContaining({ id: 'user-1', roles: ['user'], isAdmin: false }), expect.objectContaining(admin)],
      2
    ]);
    const detail = await fetch(`${base}/users/by-id/user-2`, { headers });
    expect(await detail.json()).toMatchObject(admin);
    const edited = await fetch(`${base}/auth/me/update`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Updated admin' })
    });
    expect(await edited.json()).toMatchObject({ ...admin, name: 'Updated admin' });
    for (const status of ['FREE', 'GOLD']) {
      expect(await (await changeStatus(cookie, status, 'user-2')).json()).toMatchObject({ ...admin, status });
    }
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
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(401);
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
    expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(401);
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
