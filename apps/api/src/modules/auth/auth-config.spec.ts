import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { validateAuthConfig } from './auth-config';

describe('Authentication startup configuration', () => {
  it.each([undefined, '', '  '])('refuses startup without ADMIN_EMAIL: %j', async (ADMIN_EMAIL) => {
    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            validate: () => validateAuthConfig({ ADMIN_EMAIL })
          })
        ]
      }).compile()
    ).rejects.toThrow('ADMIN_EMAIL is required');
  });
});
