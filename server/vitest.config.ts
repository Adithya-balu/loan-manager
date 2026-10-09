import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/testDb';

const url = testDatabaseUrl();

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    // Every file shares one database, so run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: url,
      DIRECT_URL: url,
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
      VERCEL: '',
    },
  },
});
