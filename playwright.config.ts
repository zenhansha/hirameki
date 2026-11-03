import { defineConfig, devices } from '@playwright/test';

// Uses the Edge that ships with Windows (no browser download needed).
const channel = process.env.PW_CHANNEL || 'msedge';
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'pc', use: { channel, viewport: { width: 1366, height: 860 }, launchOptions: launch } },
    {
      name: 'phone',
      use: {
        channel,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['Pixel 7'].userAgent,
        launchOptions: launch,
      },
    },
  ],
});
