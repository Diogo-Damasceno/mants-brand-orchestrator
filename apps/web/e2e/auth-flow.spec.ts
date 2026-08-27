import { test, expect, chromium, type Download } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import JSZip from 'jszip';

/**
 * E2E REAL do fluxo PKCE completo da extensão Mants Brand Orchestrator (Chrome/Chromium).
 *
 * Requisitos (ausência disso DEVE FALHAR):
 *  - Chromium instalado (pnpm exec playwright install --with-deps chromium).
 *  - Extensão buildada (BUILD_MODE=development, API_BASE=http://localhost:3000) em
 *    apps/extension/.output/chrome-mv3 (build de E2E, NUNCA o de produção).
 *  - App web rodando em APP_URL com cookie de sessão injetado no BrowserContext.
 *
 * Marcos (test.step) cobrem: seed, upload multipart, Chromium headless, extensão
 * carregada, cookie instalado, /api/auth/me, popup, página de autorização, aprovação,
 * exchange PKCE, side panel, recursos, prompt, edição, ZIP baixado/inspecionado,
 * uso registrado, logout e revogação.
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const EXTENSION_ROOT = path.resolve('apps/extension/.output/chrome-mv3');
const FIXTURE_PNG = path.resolve('apps/web/e2e/fixtures/logo.png');

// Diretório de evidências de vídeo (sobreposto pelo CI em test-results/).
const TEST_RESULTS_DIR = path.resolve('test-results');
const VIDEO_DIR = path.join(TEST_RESULTS_DIR, 'videos');

interface ApiResult { status: number; json: unknown; headers: http.IncomingHttpHeaders; setCookie: string[]; }
function apiFetch(method: string, p: string, body?: unknown, cookie?: string, bearer?: string): Promise<ApiResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(p, APP_URL);
    const data = body ? JSON.stringify(body) : undefined;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        json: raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null,
        headers: res.headers,
        setCookie: res.headers['set-cookie'] ? [...res.headers['set-cookie']] : [],
      }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function requireAppUp(timeoutMs = 60_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (let waited = 0; ; waited += intervalMs) {
    try {
      const r = await apiFetch('GET', '/api/health');
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    if (Date.now() >= deadline) throw new Error(`App não ficou pronto em ${timeoutMs}ms.`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function readEntryPaths(manifestPath: string): { popup: string; sidePanel: string } {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    action?: { default_popup?: string }; side_panel?: { default_path?: string };
    sidebar_action?: { default_path?: string };
  };
  const popup = m.action?.default_popup; const sidePanel = m.side_panel?.default_path ?? m.sidebar_action?.default_path;
  if (!popup) throw new Error('manifest.action.default_popup ausente');
  if (!sidePanel) throw new Error('manifest.side_panel/sidebar_action.default_path ausente');
  return { popup: popup.replace(/^\.\//, ''), sidePanel: sidePanel.replace(/^\.\//, '') };
}

interface Seed {
  email: string; password: string; orgId: string; clientId: string;
  brandKitId: string; campaignId: string; assetId: string; deviceId: string;
}
const uid = () => crypto.randomBytes(6).toString('hex');

/** Parser mínimo e válido de Set-Cookie (sem atributos inválidos). */
function toPlaywrightCookies(setCookie: string[], url: string): {
  name: string; value: string; url: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None';
}[] {
  const out: {
    name: string; value: string; url: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None';
  }[] = [];
  for (const sc of setCookie) {
    const first = (sc.split(';')[0] ?? '').split('=');
    const name = first[0];
    if (!name) continue;
    const value = first.slice(1).join('=');
    const attrs: Record<string, string> = {};
    for (const part of sc.split(';').slice(1)) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      attrs[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    }
    const sameSiteRaw = (attrs['samesite'] ?? 'lax').toLowerCase();
    const sameSite: 'Lax' | 'Strict' | 'None' = sameSiteRaw === 'strict' ? 'Strict' : sameSiteRaw === 'none' ? 'None' : 'Lax';
    out.push({
      name, value, url,
      httpOnly: (attrs['httponly'] ?? '').toLowerCase() === 'true',
      secure: (attrs['secure'] ?? '').toLowerCase() === 'true',
      sameSite,
    });
  }
  return out;
}

/**
 * Lê o Bearer (token de sessão da extensão) diretamente do storage local da
 * extensão, via o service worker. O token NÃO é exposto em logs, traces nem no
 * relatório — só é usado para montar a requisição de teste controlada.
 */
async function readExtensionToken(context: import('@playwright/test').BrowserContext): Promise<string | null> {
  const sw = context.serviceWorkers()[0] ?? null;
  if (!sw) return null;
  const token = await sw.evaluate(async () => {
    const r = await (browser.storage.local.get('mants_session') as Promise<{ mants_session?: { token?: string } }>);
    return r.mants_session?.token ?? null;
  }).catch(() => null);
  return token ?? null;
}

/**
 * Lê a chave de sessão local da extensão (para comprovar que o storage foi limpo).
 */
async function readExtensionSessionRaw(context: import('@playwright/test').BrowserContext): Promise<unknown> {
  const sw = context.serviceWorkers()[0] ?? null;
  if (!sw) return null;
  return sw.evaluate(async () => {
    const r = await (browser.storage.local.get('mants_session') as Promise<Record<string, unknown>>);
    return (r as Record<string, unknown>)['mants_session'] ?? null;
  }).catch(() => null);
}

async function seedState(): Promise<{ seed: Seed; cookie: string; setCookie: string[] }> {
  const email = `e2e+${uid()}@mants.test`; const password = 'E2e@senha123';
  const reg = await apiFetch('POST', '/api/auth/register', { name: 'E2E', email, password, organizationName: `E2E Org ${uid()}` });
  if (reg.status !== 201) throw new Error(`register falhou: ${reg.status} ${JSON.stringify(reg.json)}`);
  const orgId = (reg.json as { organizationId: string }).organizationId;
  const deviceId = `e2e-${uid()}`;

  // Login WEB (cookie) — usado para injeção no Chromium e para listar sessões.
  const login = await apiFetch('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login web falhou: ${login.status}`);
  if (!login.setCookie.length) throw new Error('login web não retornou set-cookie');
  const cookie = login.setCookie.map((c) => c.split(';')[0]).join('; ');

  // Recursos da conta (usando o cookie web como portador de fato para seed).
  const client = await apiFetch('POST', '/api/clients', { name: `Cliente ${uid()}` }, cookie);
  if (client.status !== 201) throw new Error(`cliente: ${client.status}`);
  const clientId = (client.json as { id: string }).id;
  const bk = await apiFetch(
    'POST',
    '/api/brand-kits',
    {
      name: `BK ${uid()}`,
      recommendedWords: [],
      prohibitedWords: [],
      brandExpressions: [],
      colors: [],
      fonts: [],
      approvedLogos: [],
      logoVariations: [],
      icons: [],
      graphicElements: [],
      approvedPhotos: [],
      references: [],
      approvedExamples: [],
      rejectedExamples: [],
      approvedCtas: [],
      clientId,
    },
    cookie,
  );
  if (bk.status !== 201) throw new Error(`brand-kit: ${bk.status}`);
  const brandKitId = (bk.json as { id: string }).id;
  const camp = await apiFetch(
    'POST',
    '/api/campaigns',
    {
      name: `Camp ${uid()}`,
      clientId,
      brandKitId,
      mandatoryContent: [],
      prohibitedContent: [],
      references: [],
      selectedAssetIds: [],
      promptMode: 'professional',
      variations: 1,
    },
    cookie,
  );
  if (camp.status !== 201) throw new Error(`campanha: ${camp.status}`);
  const campaignId = (camp.json as { id: string }).id;

  // Upload multipart real (PNG fixture) exigido pela rota /api/assets/upload.
  const boundary = `----mants${uid()}`;
  const fileBuf = fs.readFileSync(FIXTURE_PNG);
  // Confirma magic bytes PNG (89504e47).
  const isPng = fileBuf.length > 4 && fileBuf[0] === 0x89 && fileBuf[1] === 0x50 && fileBuf[2] === 0x4e && fileBuf[3] === 0x47;
  if (!isPng) throw new Error('fixture não é um PNG válido (magic bytes).');
  const meta = JSON.stringify({
    originalName: 'logo.png',
    mimeType: 'image/png',
    sizeBytes: fileBuf.length,
    clientId,
    brandKitId,
    commercialRightsConfirmed: true,
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const asset = await new Promise<ApiResult>((resolve, reject) => {
    const u = new URL('/api/assets/upload', APP_URL); const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request(u, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...(cookie ? { cookie } : {}) } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null, headers: res.headers, setCookie: [] }));
    });
    r.on('error', reject); r.write(body); r.end();
  });
  if (asset.status !== 201) throw new Error(`asset: ${asset.status} ${JSON.stringify(asset.json)}`);
  const assetId = (asset.json as { id: string }).id;

  return { seed: { email, password, orgId, clientId, brandKitId, campaignId, assetId, deviceId }, cookie, setCookie: login.setCookie };
}

// ---- Validação do ZIP baixado (JSZip, fixado no lockfile do projeto) -----------------
interface ZipValidation {
  valid: boolean;
  hasManifest: boolean;
  hasPrompt: boolean;
  hasReadme: boolean;
  assetFiles: string[];
  assetsNonEmpty: boolean;
  coreNonEmpty: boolean;
  hasTraversal: boolean;
  unexpectedNames: string[];
  hasExpectedAsset: boolean;
  expectedAssetNonEmpty: boolean;
  expectedAssetIsPng: boolean;
  expectedAssetMatchesFixture: boolean;
}
async function validateCreativeZip(zipPath: string, expectedAssetId: string): Promise<ZipValidation> {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const result: ZipValidation = {
    valid: true,
    hasManifest: false,
    hasPrompt: false,
    hasReadme: false,
    assetFiles: [],
    assetsNonEmpty: true,
    coreNonEmpty: true,
    hasTraversal: false,
    unexpectedNames: [],
    hasExpectedAsset: false,
    expectedAssetNonEmpty: false,
    expectedAssetIsPng: false,
    expectedAssetMatchesFixture: false,
  };
  // 1) ZIP válido (loadAsync já validou); 2) manifesto / prompt / LEIA-ME.
  result.hasManifest = names.some((n) => n.endsWith('MANIFEST.json'));
  result.hasPrompt = names.some((n) => n.endsWith('PROMPT.md'));
  result.hasReadme = names.some((n) => n.toLowerCase().endsWith('leia-me.md'));
  // 3) arquivos não vazios: ativos enviados e arquivos de conteúdo centrais.
  //    O resumo (PROMPT-RESUMIDO.md) pode ser vazio de forma legítima.
  const coreFiles = names.filter(
    (n) => n.endsWith('PROMPT.md') || n.endsWith('MANIFEST.json') || n.endsWith('BRAND-CONTEXT.json'),
  );
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const content = await entry.async('uint8array');
    // 4) ausência de path traversal (absoluto ou "..").
    if (name.startsWith('/') || name.includes('..')) {
      result.hasTraversal = true;
    }
    if (name.startsWith('selected-assets/') && name.toLowerCase().endsWith('.png')) {
      result.assetFiles.push(name);
      if (content.byteLength === 0) result.assetsNonEmpty = false;
    }
    if (coreFiles.includes(name) && content.byteLength === 0) {
      result.coreNonEmpty = false;
    }
  }
  // 5) nomes esperados presentes.
  const expected = ['PROMPT.md', 'PROMPT-RESUMIDO.md', 'BRAND-CONTEXT.json', 'BRIEFING.json', 'MANIFEST.json', 'LEIA-ME.md'];
  for (const e of expected) {
    if (!names.some((n) => n.toLowerCase().endsWith(e.toLowerCase()))) {
      result.unexpectedNames.push(e);
    }
  }
  // 6) O ativo semeado DEVE estar no pacote exatamente como selected-assets/<assetId>.<ext>.
  //    Não basta "qualquer PNG": validamos nome exato, tamanho > 0, magic bytes PNG
  //    e conteúdo idêntico (SHA-256) à fixture enviada quando o pacote preserva o original.
  const exactAssetName = `selected-assets/${expectedAssetId}.png`;
  const assetEntry = zip.files[exactAssetName];
  result.hasExpectedAsset = Boolean(assetEntry && !assetEntry.dir);
  if (assetEntry && !assetEntry.dir) {
    const content = await assetEntry.async('uint8array');
    result.expectedAssetNonEmpty = content.byteLength > 0;
    result.expectedAssetIsPng =
      content.length > 4 &&
      content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47;
    // SHA-256 da fixture enviada (logo.png); o pacote deve preservar o arquivo original.
    try {
      const fixtureBuf = fs.readFileSync(FIXTURE_PNG);
      const fixtureHash = crypto.createHash('sha256').update(fixtureBuf).digest('hex');
      const contentBuf = Buffer.from(content);
      const assetHash = crypto.createHash('sha256').update(contentBuf).digest('hex');
      result.expectedAssetMatchesFixture = assetHash === fixtureHash;
    } catch {
      result.expectedAssetMatchesFixture = false;
    }
  }
  result.valid =
    result.hasManifest && result.hasPrompt && result.hasReadme && result.assetsNonEmpty && result.coreNonEmpty && !result.hasTraversal &&
    result.hasExpectedAsset === true && result.expectedAssetNonEmpty === true && result.expectedAssetIsPng === true && result.expectedAssetMatchesFixture === true;
  return result;
}

test.describe('Fluxo PKCE completo (extensão real Chrome/Chromium)', () => {
  test('entrar, autorizar, gerar pacote e revogar', async () => {
    await requireAppUp();
    const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`Extensão não buildada em ${EXTENSION_ROOT}. Rode o build E2E primeiro.`);
    const { popup: popupPath, sidePanel: sidePanelPath } = readEntryPaths(manifestPath);

    const { seed, cookie, setCookie } = await test.step('Seed criado', async () => {
      return await seedState();
    });

    // Parsing explícito de E2E_HEADED (string "false"/"true" => boolean). Sem coerção de string.
    const headed = process.env.E2E_HEADED === 'true';
    console.log(`E2E mode: ${headed ? 'headed' : 'headless'}`);

    // Diretório de perfil temporário explícito para o Chromium.
    const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mants-e2e-'));

    const context = await test.step('Chromium iniciado em headless', async () => {
      await fs.promises.mkdir(VIDEO_DIR, { recursive: true });
      const ctx = await chromium.launchPersistentContext(userDataDir, {
        headless: !headed,
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${EXTENSION_ROOT}`,
          `--load-extension=${EXTENSION_ROOT}`,
        ],
        // Evidências: trace retido em falha (via config use.trace), vídeo retido em falha.
        recordVideo: { dir: VIDEO_DIR },
      });
      return ctx;
    });

    let dlPath = '';
    let zipValidation: ZipValidation | null = null;
    try {
      await test.step('Extensão carregada', async () => {
        const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        void new URL(bg.url()).hostname;
      });

      await test.step('Cookie autenticado no Chromium', async () => {
        await context.addCookies(toPlaywrightCookies(setCookie, APP_URL));
      });

      await test.step('/api/auth/me retornou 200 no navegador', async () => {
        const page = await context.newPage();
        await page.goto(`${APP_URL}/`);
        const me = await page.evaluate(async () => {
          const r = await fetch('/api/auth/me');
          const body = await r.json().catch(() => ({}));
          return { status: r.status, email: (body as { user?: { email?: string } }).user?.email };
        });
        expect(me.status).toBe(200);
        expect(me.email).toBe(seed.email);
      });

      // 4) Popup aberto.
      const popup = await test.step('Popup aberto', async () => {
        const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        const extId = new URL(bg.url()).hostname;
        const p = await context.newPage();
        await p.goto(`chrome-extension://${extId}/${popupPath}`);
        return p;
      });

      await test.step('Página de autorização aberta', async () => {
        // A promessa deve existir ANTES do clique que abre a nova aba.
        const authPagePromise = context.waitForEvent('page');
        await popup.getByRole('button', { name: /entrar|login/i }).click();
        const authPage = await authPagePromise;
        await authPage.waitForLoadState('domcontentloaded');
        await authPage.waitForURL(/\/extension\/authorize\?/);
      });

      await test.step('Autorização aprovada', async () => {
        const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        const extId = new URL(bg.url()).hostname;
        const authPage = context.pages().find((p) => /\/extension\/authorize\?/.test(p.url()));
        if (!authPage) throw new Error('página de autorização não encontrada');
        await authPage.getByRole('button', { name: /autorizar|concordar/i }).click();
        await popup.getByText(/autenticado|sessão válida|organização/i).first().waitFor({ timeout: 60_000 });
        void extId;
      });

      await test.step('Exchange PKCE concluído', async () => {
        // A aprovação acima dispara o exchange PKCE no service worker; confirma popup autenticado.
        await expect(popup.getByText(/autenticado|organização/i).first()).toBeVisible({ timeout: 30_000 });
      });

      const sp = await test.step('Side panel carregado', async () => {
        const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        const extId = new URL(bg.url()).hostname;
        const p = await context.newPage();
        await p.goto(`chrome-extension://${extId}/${sidePanelPath}`);
        await p.getByText(/cliente|pronto/i).first().waitFor();
        return p;
      });

      await test.step('Recursos selecionados', async () => {
        await sp.getByLabel(/cliente/i).first().selectOption({ value: seed.clientId });
        await sp.getByLabel(/brand ?kit/i).first().selectOption({ value: seed.brandKitId });
        await sp.getByLabel(/campanha/i).first().selectOption({ value: seed.campaignId });
        await sp.getByLabel(/objetivo/i).first().fill('Lançamento de verão');
        await sp.getByLabel(/público/i).first().fill('Jovens adultos');
        const assetCb = sp.getByTestId(`asset-${seed.assetId}`);
        await assetCb.check();
        await expect(assetCb).toBeChecked();
      });

      await test.step('Prompt criado', async () => {
        await sp.getByRole('button', { name: /gerar prompt/i }).click();
        const promptArea = sp.getByTestId('prompt-output');
        await expect(promptArea).toHaveValue(/objetivo|lançamento|público/i, { timeout: 30_000 });
        const promptText = await promptArea.inputValue();
        expect(promptText.length).toBeGreaterThan(10);
      });

      await test.step('Edição salva', async () => {
        await sp.getByRole('button', { name: /salvar edição/i }).click();
        await sp.getByText(/edição salva/i).first().waitFor({ timeout: 10_000 });
      });

      await test.step('ZIP baixado e inspecionado', async () => {
        const downloadPromise: Promise<Download> = sp.waitForEvent('download');
        await sp.getByTestId('download-package').click();
        const download = await downloadPromise;
        dlPath = path.join(os.tmpdir(), download.suggestedFilename());
        await download.saveAs(dlPath);
        expect(download.suggestedFilename().toLowerCase().endsWith('.zip')).toBe(true);
        expect(fs.statSync(dlPath).size).toBeGreaterThan(0);

        // Validação real do conteúdo do ZIP (JSZip).
        zipValidation = await validateCreativeZip(dlPath, seed.assetId);
        expect(zipValidation.valid, `ZIP inválido: ${JSON.stringify(zipValidation)}`).toBe(true);
        expect(zipValidation.hasManifest).toBe(true);
        expect(zipValidation.hasPrompt).toBe(true);
        expect(zipValidation.hasReadme).toBe(true);
        expect(zipValidation.assetsNonEmpty, 'ativo enviado veio vazio').toBe(true);
        expect(zipValidation.coreNonEmpty, 'arquivo de conteúdo central veio vazio').toBe(true);
        expect(zipValidation.hasTraversal).toBe(false);
        expect(zipValidation.assetFiles.length).toBeGreaterThan(0);
        expect(zipValidation.unexpectedNames).toEqual([]);
        // Ativo exato (selected-assets/<assetId>.png) presente e íntegro.
        expect(zipValidation.hasExpectedAsset, `ativo exato ausente: selected-assets/${seed.assetId}.png`).toBe(true);
        expect(zipValidation.expectedAssetNonEmpty, 'ativo exato veio vazio').toBe(true);
        expect(zipValidation.expectedAssetIsPng, 'ativo exato não é PNG (magic bytes)').toBe(true);
        expect(zipValidation.expectedAssetMatchesFixture, 'conteúdo do ativo difere da fixture enviada (SHA-256)').toBe(true);
      });

      await test.step('Uso registrado', async () => {
        await sp.getByRole('button', { name: /registrar uso/i }).click();
        await sp.getByText(/uso registrado/i).first().waitFor({ timeout: 10_000 });
      });

      // Captura o Bearer da extensão ANTES do logout (sem expô-lo em log/trace).
      const extToken = await test.step('Bearer da extensão capturado', async () => {
        const token = await readExtensionToken(context);
        expect(token, 'token de sessão da extensão não encontrado no storage local').toBeTruthy();
        return token!;
      });

      // Antes do logout: o Bearer válido deve receber 200 em /api/extension/session.
      await test.step('Bearer válido antes do logout (200)', async () => {
        const r = await apiFetch('GET', '/api/extension/session', undefined, undefined, extToken);
        expect(r.status).toBe(200);
      });

      // Antes do logout, captura a sessão da extensão (cookie web ainda válido).
      const sessionId = await test.step('Sessão ativa identificada', async () => {
        const before = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
        expect(before.status).toBe(200);
        const active = (before.json as { sessions: Array<{ id: string; status: string; deviceId: string }> }).sessions
          .filter((s) => s.status === 'active');
        expect(active.length).toBeGreaterThan(0);
        return active[0]!.id;
      });

      await test.step('Logout executado', async () => {
        await popup.getByRole('button', { name: /sair|logout|revoga/i }).click();
        await popup.getByText(/não autenticado|faça login|entrar na mants/i).first().waitFor({ timeout: 10_000 });
      });

      await test.step('Storage da extensão limpo + Bearer antigo rejeitado (401)', async () => {
        // 1) storage local da extensão foi de fato limpo.
        const raw = await readExtensionSessionRaw(context);
        expect(raw, 'storage local da extensão ainda contém a sessão após logout').toBeFalsy();
        // 2) popup em estado não autenticado (já comprovado no logout).
        // 3) o MESMO Bearer antigo agora deve receber 401 (sessão revogada).
        const reuse = await apiFetch('GET', '/api/extension/session', undefined, undefined, extToken);
        expect(reuse.status).toBe(401);
      });

      await test.step('Sessão revogada', async () => {
        // Com o cookie WEB ainda válido, relista e confirma a sessão revogada.
        const sessions = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
        expect(sessions.status).toBe(200);
        const list = (sessions.json as { sessions: Array<{ id: string; status: string; revokedAt?: string | null }> }).sessions;
        const mine = list.find((s) => s.id === sessionId);
        expect(mine).toBeDefined();
        expect(mine!.status).toBe('revoked');
        expect(mine!.revokedAt).toBeTruthy();
      });

      await test.step('Cookie web ainda válido após logout', async () => {
        // O cookie de sessão WEB não é afetado pelo logout da extensão.
        const me = await apiFetch('GET', '/api/auth/me', undefined, cookie);
        expect(me.status).toBe(200);
      });
    } finally {
      // Trace e vídeo são gerenciados pela config (trace em falha; vídeo em falha).
      await context.close();
      await fs.promises.rm(userDataDir, { recursive: true, force: true });
      if (dlPath && fs.existsSync(dlPath)) {
        await fs.promises.rm(dlPath, { force: true });
      }
    }
  });
});

// Firefox: build + manifest validados; E2E real permanece como etapa separada pendente.
test.describe('Firefox (validação estática apenas)', () => {
  test('manifest Firefox existe', () => {
    const fx = path.join('apps/extension/.output', 'firefox-mv3', 'manifest.json');
    if (!fs.existsSync(fx)) { test.skip(true, 'build Firefox não presente neste ambiente'); return; }
    const m = JSON.parse(fs.readFileSync(fx, 'utf8')) as { sidebar_action?: { default_path?: string }; browser_specific_settings?: { gecko?: { id?: string } } };
    expect(m.sidebar_action?.default_path).toBeTruthy();
    expect(m.browser_specific_settings?.gecko?.id).toBeTruthy();
  });
});
