import { defineConfig, devices } from '@playwright/test';

/**
 * E2E real da extensão Mants Brand Orchestrator.
 *
 * Requer:
 *  - Chromium instalado (npx playwright install chromium);
 *  - a extensão buildada em .output/chrome-mv3 (pnpm extension:build:chrome);
 *  - o app web rodando em http://localhost:3000 (API + DB + storage).
 *
 * O smoke cobre o fluxo PKCE completo: entrar -> autorizar -> exchange no
 * background -> popup autenticado -> side panel -> gerar/editar/copiar/inserir
 * -> baixar pacote -> registrar uso -> importar resultado -> logout.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
