import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test-setup.ts'],
    clearMocks: true,
    restoreMocks: true
  }
});
