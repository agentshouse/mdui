import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  outputDir: 'tmp/browser/results',
  reporter: [['list'], ['json', { outputFile: 'tmp/browser/report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'on',
  },
  webServer: {
    command: 'node -- scripts/host.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
