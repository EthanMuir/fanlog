import { defineConfig } from 'vitest/config';

// Database tests (tests/db): need a real Postgres, see tests/db/database.test.js.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.js'],
    environment: 'node',
    hookTimeout: 30_000,
  },
});
