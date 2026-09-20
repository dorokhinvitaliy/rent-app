import { defineConfig } from '@playwright/test';
export default defineConfig({
  globalSetup: './tests/auth.setup.ts',
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 30000,
  use: {
    storageState: 'test-results/auth.json',
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1080 },
  },
  webServer: {
    command: 'npm run build && PORT=3100 DATA_DIR=../../test-results/e2e-data npm start',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
