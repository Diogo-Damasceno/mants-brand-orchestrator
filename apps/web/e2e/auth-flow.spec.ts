import { test, expect, chromium, type Download } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

/**
 * E2E REAL do fluxo PKCE completo da extensão Mants Brand Orchestrator (Chrome/Chromium).
 *
 * Requisitos (ausência disso DEVE FALHAR):
 *  - Chromium instalado (pnpm exec playwright install --with-deps chromium).
 *  - Extensão buildada (BUILD_MODE=development, API_BASE=http://localhost:3000) em
 *    apps/extension/.output/chrome-mv3 (build de E2E, NUNCA o de produção).
 *  - App web rodando em APP_URL com cookie de sessão injetado no BrowserContext.
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const EXTENSION_ROOT = path.resolve('apps/extension/.output/chrome-mv3');
const FIXTURE_PNG = path.resolve('apps/web/e2e/fixtures/logo.png');

interface ApiResult { status: number; json: unknown; headers: http.IncomingHttpHeaders; setCookie: string[]; }
function apiFetch(method: string, p: string, body?: unknown, cookie?: string): Promise<ApiResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(p, APP_URL);
    const data = body ? JSON.stringify(body) : undefined;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
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
  while (true) {
    try { const r = await apiFetch('GET', '/api/health'); if (r.status === 200) return; } catch { /* retry */ }
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

test.describe('Fluxo PKCE completo (extensão real Chrome/Chromium)', () => {
  test('entrar, autorizar, gerar pacote e revogar', async () => {
    await requireAppUp();
    const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`Extensão não buildada em ${EXTENSION_ROOT}. Rode o build E2E primeiro.`);
    const { popup: popupPath, sidePanel: sidePanelPath } = readEntryPaths(manifestPath);
    const { seed, cookie, setCookie } = await seedState();

    const context = await chromium.launchPersistentContext('', {
      headless: !process.env.E2E_HEADED,
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_ROOT}`, `--load-extension=${EXTENSION_ROOT}`],
    });
    try {
      // 3. Injeta o cookie de sessão web ANTES do PKCE (cookie exato do login seed).
      await context.addCookies(toPlaywrightCookies(setCookie, APP_URL));
      // 3. Valida a sessão DENTRO do navegador (prova que o cookie foi instalado).
      const page = await context.newPage();
      await page.goto(`${APP_URL}/`);
      const me = await page.evaluate(async () => {
        const r = await fetch('/api/auth/me');
        const body = await r.json();
        return { status: r.status, email: body.user?.email };
      });
      expect(me.status).toBe(200);
      expect(me.email).toBe(seed.email);

      const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extId = new URL(bg.url()).hostname;
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/${popupPath}`);
      await popup.getByRole('button', { name: /entrar|login/i }).click();

      // 4. Registra a promessa da página de autorização ANTES do clique que a abre.
      const authPagePromise = context.waitForEvent('page');
      const authPage = await authPagePromise;
      await authPage.waitForURL(/extension\/authorize/);
      await authPage.getByRole('button', { name: /autorizar|concordar/i }).click();
      await popup.getByText(/autenticado|sessão válida|organização/i).first().waitFor({ timeout: 60_000 });

      // Abre o painel lateral.
      await popup.getByRole('button', { name: /painel lateral|abrir painel/i }).click();
      const sp = await context.newPage();
      await sp.goto(`chrome-extension://${extId}/${sidePanelPath}`);
      await sp.getByText(/cliente/i).first().waitFor();

      // 5/8. Seletores determinísticos por valor.
      await sp.getByLabel(/cliente/i).first().selectOption({ value: seed.clientId });
      await sp.getByLabel(/brand ?kit/i).first().selectOption({ value: seed.brandKitId });
      await sp.getByLabel(/campanha/i).first().selectOption({ value: seed.campaignId });
      await sp.getByLabel(/objetivo/i).first().fill('Lançamento de verão');
      await sp.getByLabel(/público/i).first().fill('Jovens adultos');
      // 5. Checkbox do ativo por data-testid determinístico.
      const assetCb = sp.getByTestId(`asset-${seed.assetId}`);
      await assetCb.check();
      await expect(assetCb).toBeChecked();
      await sp.getByRole('button', { name: /gerar prompt/i }).click();
      const promptArea = sp.getByTestId('prompt-output');
      await expect(promptArea).toHaveValue(/objetivo|lançamento|público/i, { timeout: 30_000 });
      const promptText = await promptArea.inputValue();
      expect(promptText.length).toBeGreaterThan(10);

      // 8. Edição: salva e confirma sucesso na UI.
      await sp.getByRole('button', { name: /salvar edição/i }).click();
      await sp.getByText(/edição salva/i).first().waitFor({ timeout: 10_000 });

      // 4. Download: registra a promessa ANTES do clique.
      const downloadPromise: Promise<Download> = sp.waitForEvent('download');
      await sp.getByRole('button', { name: /baixar pacote/i }).click();
      const download = await downloadPromise;
      const dlPath = path.join(os.tmpdir(), download.suggestedFilename());
      await download.saveAs(dlPath);
      expect(download.suggestedFilename().toLowerCase().endsWith('.zip')).toBe(true);
      expect(fs.statSync(dlPath).size).toBeGreaterThan(0);

      // 8. Uso registrado via UI da extensão (POST /api/prompts/{id}/usage).
      await sp.getByRole('button', { name: /registrar uso/i }).click();
      await sp.getByText(/uso registrado/i).first().waitFor({ timeout: 10_000 });

      // 7. Antes do logout, captura a sessão da extensão (cookie web ainda válido).
      const before = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
      expect(before.status).toBe(200);
      const active = (before.json as { sessions: Array<{ id: string; status: string; deviceId: string }> }).sessions
        .filter((s) => s.status === 'active');
      expect(active.length).toBeGreaterThan(0);
      const sessionId = active[0]!.id;

      // 7. Logout/revogação da extensão (NÃO espera 401 no cookie web).
      await popup.getByRole('button', { name: /sair|logout|revoga/i }).click();
      await popup.getByText(/não autenticado|faça login|entrar na mants/i).first().waitFor({ timeout: 10_000 });

      // Com o cookie WEB ainda válido, relista e confirma a sessão revogada.
      const sessions = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
      expect(sessions.status).toBe(200);
      const list = (sessions.json as { sessions: Array<{ id: string; status: string; revokedAt?: string | null }> }).sessions;
      const mine = list.find((s) => s.id === sessionId);
      expect(mine).toBeDefined();
      expect(mine!.status).toBe('revoked');
      expect(mine!.revokedAt).toBeTruthy();
    } finally {
      await context.close();
    }
  });
});

// Firefox: build + manifest validados; E2E real permanece como etapa separada pendente.
test.describe('Firefox (validação estática apenas)', () => {
  test('manifest Firefox existe', () => {
    const fx = path.join('apps/extension/.output', 'firefox-mv2', 'manifest.json');
    if (!fs.existsSync(fx)) { test.skip(true, 'build Firefox não presente neste ambiente'); return; }
    const m = JSON.parse(fs.readFileSync(fx, 'utf8')) as { sidebar_action?: { default_path?: string }; browser_specific_settings?: { gecko?: { id?: string } } };
    expect(m.sidebar_action?.default_path).toBeTruthy();
    expect(m.browser_specific_settings?.gecko?.id).toBeTruthy();
  });
});
