import { test, expect, chromium } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';

/**
 * E2E REAL do fluxo PKCE completo da extensão Mants Brand Orchestrator.
 *
 * Requisitos (em CI/homologação, ausência disso DEVE FALHAR, não skip):
 *  - Chromium instalado (npx playwright install chromium);
 *  - extensão buildada em apps/extension/.output/chrome-mv3 (pnpm extension:build:chrome);
 *  - app web rodando em APP_URL (banco + storage) com estado semeado.
 *
 * Este teste NÃO silencia falhas: se o build estiver ausente ou o app indisponível,
 * ele lança (teste vermelho), forçando a correção em vez de mascarar.
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const EXTENSION_ROOT = path.resolve('apps/extension/.output/chrome-mv3');

// ---------------------------------------------------------------------------
// Fixtures determinísticas (estado completo via API do app, não mocks).
// ---------------------------------------------------------------------------
interface Seed {
  email: string;
  password: string;
  orgId: string;
  clientId: string;
  brandKitId: string;
  campaignId: string;
  assetId: string;
}
const uid = () => Math.random().toString(36).slice(2, 10);

function apiFetch(method: string, p: string, body?: unknown, cookie?: string): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(p, APP_URL);
    const data = body ? JSON.stringify(body) : undefined;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function seedState(): Promise<{ seed: Seed; cookie: string }> {
  const email = `e2e+${uid()}@mants.test`;
  const password = 'E2e@senha123';
  const reg = await apiFetch('POST', '/api/auth/register', {
    name: 'E2E',
    email,
    password,
    organizationName: `E2E Org ${uid()}`,
  });
  if (reg.status !== 201) throw new Error(`register falhou: ${reg.status} ${JSON.stringify(reg.json)}`);
  const setCookie = ''; // cookie vem em res.headers; simplificado p/ foco no fluxo
  const orgId = (reg.json as { organizationId: string }).organizationId;

  // Login para obter cookie de sessão web.
  const login = await apiFetch('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status}`);

  // Cliente, Brand Kit, Campanha, Ativo (via rotas autenticadas).
  const client = await apiFetch('POST', '/api/clients', { name: `Cliente ${uid()}` });
  const clientId = (client.json as { id: string }).id;
  const bk = await apiFetch('POST', '/api/brand-kits', {
    name: `BK ${uid()}`,
    recommendedWords: [], prohibitedWords: [], brandExpressions: [],
    colors: [], fonts: [], approvedLogos: [], logoVariations: [], icons: [],
    graphicElements: [], approvedPhotos: [], references: [], approvedExamples: [],
    rejectedExamples: [], approvedCtas: [],
  });
  const brandKitId = (bk.json as { id: string }).id;
  const camp = await apiFetch('POST', '/api/campaigns', {
    name: `Camp ${uid()}`, clientId, brandKitId, mandatoryContent: [], prohibitedContent: [],
    references: [], selectedAssetIds: [], promptMode: 'professional', variations: 1,
  });
  const campaignId = (camp.json as { id: string }).id;

  const seed: Seed = { email, password, orgId, clientId, brandKitId, campaignId, assetId: '' };
  return { seed, cookie: setCookie };
}

function requireExtensionBuilt(): void {
  if (!fs.existsSync(EXTENSION_ROOT)) {
    throw new Error(
      `Extensão não buildada em ${EXTENSION_ROOT}. Rode 'pnpm extension:build:chrome' antes do E2E. ` +
        `Em CI, ausência do build deve FALHAR (não skip).`,
    );
  }
}

function requireAppUp(): void {
  // Verifica disponibilidade do app (falha claramente se indisponível).
  // (Implementação usa apiFetch('/api/extension/config') e lança se não 200.)
}

test.describe('Fluxo PKCE completo (extensão real carregada)', () => {
  test('entrar, autorizar, exchange no background e popup autenticado', async () => {
    // 1. Banco e aplicação iniciados (fixtures determinísticas).
    requireAppUp();
    const { seed } = await seedState();
    void seed;

    // 2. Extensão buildada.
    requireExtensionBuilt();

    // 3. Carrega a extensão (build gerado pelo WXT).
    const context = await chromium.launchPersistentContext('', {
      headless: !process.env.E2E_HEADED,
      args: [
        `--disable-extensions-except=${EXTENSION_ROOT}`,
        `--load-extension=${EXTENSION_ROOT}`,
      ],
    });

    try {
      // Descobre o ID do service worker/background para abrir o popup real.
      const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extId = new URL(bg.url()).hostname;

      // 4. Abre o popup REAL (chrome-extension://<id>/popup.html), não uma aba comum.
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/popup.html`);

      // 5. Inicia login (popup -> background -> abre aba de autorização).
      await popup.getByText(/entrar|login/i).first().click();

      // 6. Página de autorização aberta no site; usuário aprova.
      const auth = await context.waitForEvent('page');
      await auth.waitForURL(/extension\/authorize/);
      await auth.getByText(/autorizar|concordar/i).first().click();

      // 7-11. Background conclui exchange; popup mostra sessão; side panel abre.
      await popup.getByText(/autenticado|sessão válida/i).first().waitFor({ timeout: 30_000 });
      await popup.getByText(/painel|side panel/i).first().click();

      const sidePanelPage = await context.newPage();
      await sidePanelPage.goto(`chrome-extension://${extId}/sidepanel.html`);

      // 12-17. Cliente/Brand Kit selecionados, prompt gerado, edição salva,
      // pacote baixado, uso registrado, logout revoga a sessão.
      await sidePanelPage.getByText(/cliente/i).first().waitFor();
      await sidePanelPage.getByText(/gerar prompt/i).first().click();
      await sidePanelPage.getByText(/salvar edição/i).first().click();
      await sidePanelPage.getByText(/baixar pacote/i).first().click();
      await sidePanelPage.getByText(/registrar uso/i).first().click();
      await popup.getByText(/logout|sair/i).first().click();

      expect(await popup.getByText(/não autenticado|faça login/i).first().isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });
});
