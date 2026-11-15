import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx scripts/e2e-server.ts',
      url: 'http://127.0.0.1:3101/ready',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm --prefix web run dev -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      env: {
        VITE_MOCKS: 'none',
        VITE_API_URL: '',
        VITE_API_PROXY: 'http://127.0.0.1:3101',
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
