import { defineConfig, devices } from '@playwright/test';

// Playwright config for the optional e2e job. Builds the app once and
// serves it via `vite preview`; the test suite drives the preview server.
//
// Gated in CI by the `e2e` PR label — see .github/workflows/gdfkube-itsm-ci.yml.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
