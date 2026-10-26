import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      // The waitlist edge function imports supabase-js from JSR (Deno); the
      // unit tests swap in a fake through this alias.
      'jsr:@supabase/supabase-js@2': fileURLToPath(new URL('./tests/stubs/jsr-supabase.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/db/**', 'node_modules/**'],
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
