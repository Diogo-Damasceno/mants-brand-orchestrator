import { defineConfig, devices } from '@playwright/test';

// E2E do fluxo PKCE da extensão. Requer:
//  - web rodando em http://localhost:3000 (pnpm --filter @mants/web dev/start)
//  - extensão Chrome buildada em apps/extension/.output/chrome-mv3 (load via --load-extension)
// Variáveis: E2E_BASE_URL (padrão http://localhost:3000), E2E_EXT_PATH.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    launchOptions: process.env.E2E_EXT_PATH
      ? { args: [`--load-extension=${process.env.E2E_EXT_PATH}`, '--disable-extensions-except=' + process.env.E2E_EXT_PATH] }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-smoke',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
