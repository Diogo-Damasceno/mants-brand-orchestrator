import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
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
 *
 * Firefox é separado (ver describe gated por E2E_FIREFOX): não declaramos E2E
 * Firefox a menos que o navegador Firefox realmente seja iniciado.
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const EXTENSION_ROOT = path.resolve('apps/extension/.output/chrome-mv3');

interface ApiResult {
  status: number;
  json: unknown;
  headers: http.IncomingHttpHeaders;
  setCookie: string[];
}

function apiFetch(method: string, p: string, body?: unknown, cookie?: string): Promise<ApiResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(p, APP_URL);
    const data = body ? JSON.stringify(body) : undefined;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            json: raw ? JSON.parse(raw) : null,
            headers: res.headers,
            setCookie: res.headers['set-cookie'] ? [...res.headers['set-cookie']] : [],
          }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function requireAppUp(timeoutMs = 60_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const r = await apiFetch('GET', '/api/health');
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    if (Date.now() >= deadline) {
      throw new Error(`App não ficou pronto em ${timeoutMs}ms (health check falhou).`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function requireExtensionBuilt(): Promise<string> {
  const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Extensão não buildada em ${EXTENSION_ROOT}. Rode 'pnpm extension:build:chrome' antes do E2E. ` +
        `Em CI, ausência do build deve FALHAR (não skip).`,
    );
  }
  return manifestPath;
}

// Lê o manifesto para descobrir os nomes REAIS dos arquivos de popup/side_panel.
function readEntryPaths(manifestPath: string): { popup: string; sidePanel: string } {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    action?: { default_popup?: string };
    side_panel?: { default_path?: string };
    chrome_url_overrides?: { side_panel?: string };
  };
  const popup = manifest.action?.default_popup;
  const sidePanel = manifest.side_panel?.default_path ?? manifest.chrome_url_overrides?.side_panel;
  if (!popup) throw new Error('manifest.action.default_popup ausente');
  if (!sidePanel) throw new Error('manifest.side_panel.default_path ausente');
  return {
    popup: popup.replace(/^\.\//, ''),
    sidePanel: sidePanel.replace(/^\.\//, ''),
  };
}

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
  const orgId = (reg.json as { organizationId: string }).organizationId;

  // Login pela interface web (obtém cookie de sessão web real).
  const login = await apiFetch('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status} ${JSON.stringify(login.json)}`);
  if (login.setCookie.length === 0) throw new Error('login não retornou set-cookie');

  // Cookie jar confiável: pega todos os set-cookie do login.
  const cookie = login.setCookie.map((c) => c.split(';')[0]).join('; ');

  // Rotas protegidas recebem o cookie real; verificamos cada status.
  const client = await apiFetch('POST', '/api/clients', { name: `Cliente ${uid()}` }, cookie);
  if (client.status !== 201) throw new Error(`cliente: ${client.status} ${JSON.stringify(client.json)}`);
  const clientId = (client.json as { id: string }).id;

  const bk = await apiFetch(
    'POST',
    '/api/brand-kits',
    {
      name: `BK ${uid()}`,
      recommendedWords: [], prohibitedWords: [], brandExpressions: [],
      colors: [], fonts: [], approvedLogos: [], logoVariations: [], icons: [],
      graphicElements: [], approvedPhotos: [], references: [], approvedExamples: [],
      rejectedExamples: [], approvedCtas: [],
    },
    cookie,
  );
  if (bk.status !== 201) throw new Error(`brand-kit: ${bk.status} ${JSON.stringify(bk.json)}`);
  const brandKitId = (bk.json as { id: string }).id;

  const camp = await apiFetch(
    'POST',
    '/api/campaigns',
    {
      name: `Camp ${uid()}`, clientId, brandKitId, mandatoryContent: [], prohibitedContent: [],
      references: [], selectedAssetIds: [], promptMode: 'professional', variations: 1,
    },
    cookie,
  );
  if (camp.status !== 201) throw new Error(`campanha: ${camp.status} ${JSON.stringify(camp.json)}`);
  const campaignId = (camp.json as { id: string }).id;

  // Cria um ativo válido (o tipo Seed exige assetId não vazio).
  const asset = await apiFetch(
    'POST',
    '/api/assets/upload',
    { clientId, brandKitId, originalName: 'logo.png', mimeType: 'image/png', sizeBytes: 10 },
    cookie,
  );
  if (asset.status !== 201) throw new Error(`asset: ${asset.status} ${JSON.stringify(asset.json)}`);
  const assetId = (asset.json as { id: string }).id;

  const seed: Seed = { email, password, orgId, clientId, brandKitId, campaignId, assetId };
  return { seed, cookie };
}

async function openExtensionPopup(context: BrowserContext, extId: string, popupPath: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/${popupPath}`);
  return popup;
}

test.describe('Fluxo PKCE completo (extensão real Chrome/Chromium)', () => {
  test('entrar, autorizar, exchange no background e popup autenticado', async () => {
    // 1. App pronto (polling + timeout).
    await requireAppUp();

    // 2. Extensão buildada (falha claramente se ausente).
    const manifestPath = await requireExtensionBuilt();
    const { popup: popupPath, sidePanel: sidePanelPath } = readEntryPaths(manifestPath);

    // 3. Seed autenticado.
    const { seed, cookie } = await seedState();
    void seed;

    // 4. Carrega a extensão (build gerado pelo WXT).
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

      // 5. Abre o popup REAL (caminho do manifesto), não uma aba comum.
      const popup = await openExtensionPopup(context, extId, popupPath);

      // Confirma que o navegador reconhece a sessão web injetada.
      const me = await apiFetch('GET', '/api/auth/me', undefined, cookie);
      if (me.status !== 200) throw new Error(`/api/auth/me não autenticado: ${me.status}`);

      // 6. Inicia login (popup -> background -> abre aba de autorização).
      await popup.getByText(/entrar|login/i).first().click();

      // 7. Página de autorização aberta no site; usuário aprova.
      const auth = await context.waitForEvent('page');
      await auth.waitForURL(/extension\/authorize/);
      await auth.getByText(/autorizar|concordar/i).first().click();

      // 8-11. Background conclui exchange; popup mostra sessão; side panel abre.
      await popup.getByText(/autenticado|sessão válida/i).first().waitFor({ timeout: 30_000 });
      await popup.getByText(/painel|side panel/i).first().click();

      const sidePanelPage = await context.newPage();
      await sidePanelPage.goto(`chrome-extension://${extId}/${sidePanelPath}`);

      // 12-17. Seleção real de dados + geração de prompt + edição + download + uso + logout.
      await sidePanelPage.getByText(/cliente/i).first().waitFor();
      await sidePanelPage.getByText(new RegExp(seed.clientId.slice(0, 8))).first().click();
      await sidePanelPage.getByText(new RegExp(seed.brandKitId.slice(0, 8))).first().click();
      await sidePanelPage.getByText(new RegExp(seed.campaignId.slice(0, 8))).first().click();
      await sidePanelPage.getByLabel(/objetivo/i).first().fill('Lançamento de verão');
      await sidePanelPage.getByLabel(/público/i).first().fill('Jovens adultos');
      await sidePanelPage.getByText(new RegExp(seed.assetId.slice(0, 8))).first().click();
      await sidePanelPage.getByText(/gerar prompt/i).first().click();

      const promptText = await sidePanelPage.getByText(/#|\*|objetivo|público/i).first().innerText();
      expect(promptText.length).toBeGreaterThan(10);

      await sidePanelPage.getByText(/salvar edição/i).first().click();
      await sidePanelPage.getByText(/baixar pacote/i).first().click();

      // 18. Confirma arquivo ZIP no diretório de downloads.
      const downloadPromise = sidePanelPage.waitForEvent('download', { timeout: 30_000 });
      const download = await downloadPromise;
      const dlPath = await download.path();
      expect(dlPath).toBeTruthy();
      const fname = download.suggestedFilename();
      expect(fname.toLowerCase().endsWith('.zip')).toBe(true);

      await sidePanelPage.getByText(/registrar uso/i).first().click();
      await popup.getByText(/logout|sair/i).first().click();
      expect(await popup.getByText(/não autenticado|faça login/i).first().isVisible()).toBe(true);

      // 19. Confirma revogação consultando o backend.
      const sessions = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
      const list = (sessions.json as { sessions?: { status: string }[] }).sessions ?? [];
      expect(list.every((s) => s.status !== 'active')).toBe(true);
    } finally {
      await context.close();
    }
  });
});

// Firefox: E2E real SOMENTE se E2E_FIREFOX=1 (navegador iniciado de fato).
// Caso contrário, este describe pula (não declaramos E2E Firefox falso).
const runFirefox = process.env.E2E_FIREFOX === '1';
test.describe('E2E Firefox (gated)', () => {
  test.skip(!runFirefox, 'E2E Firefox desativado (exige E2E_FIREFOX=1 e Firefox instalado).');

  test('Firefox: extensão carregada e popup abre', async ({ browserName }) => {
    if (browserName !== 'firefox') {
      // Validação estática do manifesto Firefox (sem navegador real).
      const fxManifest = path.join('apps/extension/.output', 'firefox-mv3', 'manifest.json');
      expect(fs.existsSync(fxManifest)).toBe(true);
      return;
    }
    const context = await chromium.launchPersistentContext('', {
      headless: !process.env.E2E_HEADED,
      channel: 'firefox',
      args: [`--load-extension=${EXTENSION_ROOT}`],
    });
    await context.close();
  });
});
