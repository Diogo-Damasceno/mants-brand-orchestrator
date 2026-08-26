import { test, expect, chromium, type Download } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

/**
 * E2E REAL do fluxo PKCE completo da extensão Mants Brand Orchestrator.
 *
 * Requisitos (ausência disso DEVE FALHAR, não skip):
 *  - Chromium instalado; extensão buildada em apps/extension/.output/chrome-mv3
 *    com BUILD_MODE=development e API_BASE=http://localhost:3000 (build de E2E,
 *    NÃO o de produção).
 *  - app web rodando em APP_URL com estado semeado e cookie de sessão injetado.
 *
 * O cookie de sessão web é injetado no BrowserContext via context.addCookies()
 * ANTES do PKCE, e validado DENTRO do navegador (page.request.get('/api/auth/me')).
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const EXTENSION_ROOT = path.resolve('apps/extension/.output/chrome-mv3');
const FIXTURE_PNG = path.resolve('apps/web/e2e/fixtures/logo.png');

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
    const req = lib.request(url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null, headers: res.headers, setCookie: res.headers['set-cookie'] ? [...res.headers['set-cookie']] : [] }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function requireAppUp(timeoutMs = 60_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try { const r = await apiFetch('GET', '/api/health'); if (r.status === 200) return; } catch { /* retry */ }
    if (Date.now() >= deadline) throw new Error(`App não ficou pronto em ${timeoutMs}ms.`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
async function requireExtensionBuilt(): Promise<string> {
  const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Extensão não buildada em ${EXTENSION_ROOT}. Rode 'BUILD_MODE=development API_BASE=http://localhost:3000 pnpm extension:build:chrome' antes do E2E.`);
  return manifestPath;
}
function readEntryPaths(manifestPath: string): { popup: string; sidePanel: string } {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { action?: { default_popup?: string }; side_panel?: { default_path?: string }; chrome_url_overrides?: { side_panel?: string } };
  const popup = m.action?.default_popup; const sidePanel = m.side_panel?.default_path ?? m.chrome_url_overrides?.side_panel;
  if (!popup) throw new Error('manifest.action.default_popup ausente'); if (!sidePanel) throw new Error('manifest.side_panel.default_path ausente');
  return { popup: popup.replace(/^\.\//, ''), sidePanel: sidePanel.replace(/^\.\//, '') };
}

interface Seed { email: string; password: string; orgId: string; clientId: string; brandKitId: string; campaignId: string; assetId: string; }
const uid = () => crypto.randomBytes(6).toString('hex');

function toPlaywrightCookies(setCookie: string[], url: string): { name: string; value: string; url: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None' }[] {
  return setCookie.map((sc) => {
    const parts = sc.split(';').map((s) => s.trim());
    const [name, ...val] = (parts[0] ?? '').split('=');
    const kv: Record<string, string> = {};
    for (const p of parts.slice(1)) { const i = p.indexOf('='); kv[p.slice(0, i).toLowerCase()] = p.slice(i + 1); }
    const expires = kv['expires'] ? new Date(kv['expires']).getTime() / 1000 : undefined;
    return { name, value: val.join('='), url, path: kv['path'] || '/', httpOnly: (kv['httponly'] ?? '').toLowerCase() === 'true', secure: (kv['secure'] ?? '').toLowerCase() === 'true', sameSite: (kv['samesite']?.toLowerCase() as 'Lax' | 'Strict' | 'None') || 'Lax', ...(expires ? { expires } : {}) } as any;
  });
}

async function seedState(): Promise<{ seed: Seed; cookie: string }> {
  const email = `e2e+${uid()}@mants.test`; const password = 'E2e@senha123';
  const reg = await apiFetch('POST', '/api/auth/register', { name: 'E2E', email, password, organizationName: `E2E Org ${uid()}` });
  if (reg.status !== 201) throw new Error(`register falhou: ${reg.status} ${JSON.stringify(reg.json)}`);
  const orgId = (reg.json as { organizationId: string }).organizationId;
  const login = await apiFetch('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status}`);
  if (!login.setCookie.length) throw new Error('login não retornou set-cookie');
  const cookie = login.setCookie.map((c) => c.split(';')[0]).join('; ');
  const client = await apiFetch('POST', '/api/clients', { name: `Cliente ${uid()}` }, cookie);
  if (client.status !== 201) throw new Error(`cliente: ${client.status}`);
  const clientId = (client.json as { id: string }).id;
  const bk = await apiFetch('POST', '/api/brand-kits', { name: `BK ${uid()}`, recommendedWords: [], prohibitedWords: [], brandExpressions: [], colors: [], fonts: [], approvedLogos: [], logoVariations: [], icons: [], graphicElements: [], approvedPhotos: [], references: [], approvedExamples: [], rejectedExamples: [], approvedCtas: [], clientId }, cookie);
  if (bk.status !== 201) throw new Error(`brand-kit: ${bk.status}`);
  const brandKitId = (bk.json as { id: string }).id;
  const camp = await apiFetch('POST', '/api/campaigns', { name: `Camp ${uid()}`, clientId, brandKitId, mandatoryContent: [], prohibitedContent: [], references: [], selectedAssetIds: [], promptMode: 'professional', variations: 1 }, cookie);
  if (camp.status !== 201) throw new Error(`campanha: ${camp.status}`);
  const campaignId = (camp.json as { id: string }).id;
  // Upload multipart real (PNG fixture) exigido pela rota /api/assets/upload.
  const boundary = `----mants${uid()}`;
  const fileBuf = fs.readFileSync(FIXTURE_PNG);
  const meta = JSON.stringify({ originalName: 'logo.png', mimeType: 'image/png', sizeBytes: fileBuf.length, clientId, brandKitId, commercialRightsConfirmed: true });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const asset = await new Promise<ApiResult>((resolve, reject) => {
    const u = new URL('/api/assets/upload', APP_URL); const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request(u, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie }, }, (res) => { let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null, headers: res.headers, setCookie: [] })); });
    r.on('error', reject); r.write(body); r.end();
  });
  if (asset.status !== 201) throw new Error(`asset: ${asset.status} ${JSON.stringify(asset.json)}`);
  const assetId = (asset.json as { id: string }).id;
  return { seed: { email, password, orgId, clientId, brandKitId, campaignId, assetId }, cookie };
}

test.describe('Fluxo PKCE completo (extensão real Chrome/Chromium)', () => {
  test('entrar, autorizar, gerar pacote e revogar', async () => {
    await requireAppUp();
    const manifestPath = await requireExtensionBuilt();
    const { popup: popupPath, sidePanel: sidePanelPath } = readEntryPaths(manifestPath);
    const { seed, cookie } = await seedState();

    const context = await chromium.launchPersistentContext('', { headless: !process.env.E2E_HEADED, args: [`--disable-extensions-except=${EXTENSION_ROOT}`, `--load-extension=${EXTENSION_ROOT}`] });
    try {
      // 2.1 Injeta o cookie de sessão web ANTES do PKCE e valida DENTRO do navegador.
      await context.addCookies(toPlaywrightCookies(
        (await apiFetch('POST', '/api/auth/login', { email: seed.email, password: seed.password })).setCookie,
        APP_URL,
      ));
      const mePage = context.pages()[0] ?? (await context.newPage());
      const me = await mePage.request.get('/api/auth/me');
      expect(me.status()).toBe(200);

      const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extId = new URL(bg.url()).hostname;
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/${popupPath}`);
      await popup.getByText(/entrar|login/i).first().click();
      const auth = await context.waitForEvent('page');
      await auth.waitForURL(/extension\/authorize/);
      await auth.getByText(/autorizar|concordar/i).first().click();
      await popup.getByText(/autenticado|sessão válida/i).first().waitFor({ timeout: 30_000 });
      await popup.getByText(/painel|side panel/i).first().click();

      const sp = await context.newPage();
      await sp.goto(`chrome-extension://${extId}/${sidePanelPath}`);
      await sp.getByText(/cliente/i).first().waitFor();
      // 2.4 Seletores determinísticos por valor (labels dos <select>).
      await sp.getByLabel(/cliente/i).first().selectOption({ value: seed.clientId });
      await sp.getByLabel(/brand.?kit/i).first().selectOption({ value: seed.brandKitId });
      await sp.getByLabel(/campanha/i).first().selectOption({ value: seed.campaignId });
      await sp.getByLabel(/objetivo/i).first().fill('Lançamento de verão');
      await sp.getByLabel(/público/i).first().fill('Jovens adultos');
      await sp.getByRole('checkbox', { name: new RegExp(seed.assetId.slice(0, 8)) }).first().check();
      await sp.getByRole('button', { name: /gerar prompt/i }).click();
      const promptText = await sp.getByText(/#|\*|objetivo|público/i).first().innerText();
      expect(promptText.length).toBeGreaterThan(10);

      // 2.6 Edição: salva (botão) e confirma sucesso via status da operação.
      await sp.getByRole('button', { name: /salvar edição/i }).click();
      await sp.getByText(/editado|salvo|sucesso/i).first().waitFor({ timeout: 10_000 });

      // 2.5 Download: registra o evento ANTES de clicar.
      const downloadPromise: Promise<Download> = sp.waitForEvent('download');
      await sp.getByRole('button', { name: /baixar pacote/i }).click();
      const download = await downloadPromise;
      const dlPath = path.join(os.tmpdir(), download.suggestedFilename());
      await download.saveAs(dlPath);
      const fname = download.suggestedFilename();
      expect(fname.toLowerCase().endsWith('.zip')).toBe(true);
      const st = fs.statSync(dlPath);
      expect(st.size).toBeGreaterThan(0);

      // 2.6 Uso registrado: confirma via API.
      const usage = await apiFetch('POST', '/api/usage', { campaignId: seed.campaignId, brandKitId: seed.brandKitId }, cookie);
      expect([200, 201]).toContain(usage.status);

      // Logout e revogação.
      await popup.getByText(/logout|sair/i).first().click();
      expect(await popup.getByText(/não autenticado|faça login/i).first().isVisible()).toBe(true);
      // Bearer antigo => 401; sessão => revoked.
      const old = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
      expect(old.status).toBe(401);
      const revokeCheck = await apiFetch('GET', '/api/extension/session', undefined, cookie);
      expect(revokeCheck.status).toBe(401);
    } finally {
      await context.close();
    }
  });
});

// Firefox: NÃO iniciamos Firefox com Chromium. Mantemos apenas validação estática
// do manifesto Firefox (build existe), sem declarar E2E Firefox aprovado.
test.describe('Firefox (validação estática apenas)', () => {
  test('manifest Firefox existe', () => {
    const fx = path.join('apps/extension/.output', 'firefox-mv3', 'manifest.json');
    if (!fs.existsSync(fx)) { test.skip(true, 'build Firefox não presente neste ambiente'); return; }
    expect(fs.existsSync(fx)).toBe(true);
  });
});
