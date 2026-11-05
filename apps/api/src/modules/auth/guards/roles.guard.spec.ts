import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../decorators';
import { Roles } from '../enums';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  class Controller {
    action() {}
  }
  let guard: RolesGuard;

  beforeEach(async () => {
    Reflect.deleteMetadata(ROLES_KEY, Controller);
    Reflect.deleteMetadata(ROLES_KEY, Controller.prototype.action);
    const module = await Test.createTestingModule({ providers: [RolesGuard, Reflector] }).compile();
    guard = module.get(RolesGuard);
  });

  function context(user?: { roles?: string[] }) {
    return new ExecutionContextHost([{ user }], Controller, Controller.prototype.action);
  }

  it('allows access when no roles are required', () => {
    expect(guard.canActivate(context())).toBe(true);
  });

  it.each([undefined, {}, { roles: [] }, { roles: ['other'] }])(
    'rejects a user without a required role: %j',
    (user) => {
      Reflect.defineMetadata(ROLES_KEY, [Roles.USER], Controller);
      expect(guard.canActivate(context(user))).toBe(false);
    }
  );

  it.each([Roles.USER, Roles.ADMIN])('allows a matching role or administrator: %s', (role) => {
    Reflect.defineMetadata(ROLES_KEY, [Roles.USER], Controller);
    expect(guard.canActivate(context({ roles: [role] }))).toBe(true);
  });

  it('uses method requirements before controller requirements', () => {
    Reflect.defineMetadata(ROLES_KEY, [Roles.USER], Controller);
    Reflect.defineMetadata(ROLES_KEY, [Roles.ADMIN], Controller.prototype.action);
    expect(guard.canActivate(context({ roles: [Roles.USER] }))).toBe(false);
  });
});
