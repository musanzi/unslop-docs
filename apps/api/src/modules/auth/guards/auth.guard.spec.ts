import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../decorators';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  class Controller {
    action() {}
  }
  let guard: AuthGuard;

  beforeEach(async () => {
    Reflect.deleteMetadata(IS_PUBLIC_KEY, Controller);
    Reflect.deleteMetadata(IS_PUBLIC_KEY, Controller.prototype.action);
    const module = await Test.createTestingModule({ providers: [AuthGuard, Reflector] }).compile();
    guard = module.get(AuthGuard);
  });

  function context(isAuthenticated = vi.fn(() => false)) {
    return new ExecutionContextHost([{ isAuthenticated }], Controller, Controller.prototype.action);
  }

  it.each([Controller, Controller.prototype.action])('allows public access without authentication', async (target) => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    const isAuthenticated = vi.fn(() => false);
    await expect(guard.canActivate(context(isAuthenticated))).resolves.toBe(true);
    expect(isAuthenticated).not.toHaveBeenCalled();
  });

  it.each([true, false])('uses authentication for protected access: %s', async (authenticated) => {
    await expect(guard.canActivate(context(vi.fn(() => authenticated)))).resolves.toBe(authenticated);
  });

  it('lets a protected method override a public controller', async () => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, Controller);
    Reflect.defineMetadata(IS_PUBLIC_KEY, false, Controller.prototype.action);
    await expect(guard.canActivate(context())).resolves.toBe(false);
  });
});
