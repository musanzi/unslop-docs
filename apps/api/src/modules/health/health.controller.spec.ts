import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('allows unauthenticated access to health checks', () => {
    const reflector = new Reflector();
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });
});
