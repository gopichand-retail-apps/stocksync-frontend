import { defineConfig, devices } from '@playwright/test';

const isMock = process.env.VITE_IS_MOCK ?? 'true';
const frontendPort = Number(process.env.STOCKSYNC_E2E_FRONTEND_PORT ?? 5403);
const apiPort = Number(process.env.STOCKSYNC_E2E_API_PORT ?? 5404);
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const unavailableApiBaseUrl = 'http://127.0.0.1:1/api/v1';

if (frontendPort === apiPort) {
  throw new Error('StockSync E2E frontend and API ports must be different.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../stocksync-backend',
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(apiPort),
        WEB_ORIGIN: frontendUrl,
        STOCKSYNC_START_SERVER: 'true',
        STOCKSYNC_DATA_DIR: 'memory://',
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_IS_MOCK: isMock,
        VITE_MOCK_API_BASE_URL: isMock === 'true' ? apiBaseUrl : unavailableApiBaseUrl,
        VITE_REAL_API_BASE_URL: isMock === 'false' ? apiBaseUrl : unavailableApiBaseUrl,
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:1',
      },
    },
  ],
});
