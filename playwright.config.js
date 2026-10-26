import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, APP_URL, BUILD_ENV } from './e2e/env.js';

// End-to-end suite: the production build (vite build + vite preview) in
// Chromium. Supabase and every other outside host are faked per test in
// e2e/fixtures.js, so runs are deterministic and never touch real data.
// See e2e/README.md.
//
// E2E_SKIP_BUILD=1 reuses an existing dist/ (it must have been built with
// BUILD_ENV, because VITE_* values are baked in at build time).

const build = process.env.E2E_SKIP_BUILD ? '' : 'npx vite build && ';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Skips the reveal animation's timers; the app honours it explicitly.
    reducedMotion: 'reduce',
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `${build}npx vite preview --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: BUILD_ENV,
  },
});
