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
            json: raw ? safeJson(raw) : null,
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

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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
    if (Date.now() >= deadline) throw new Error(`App não ficou pronto em ${timeoutMs}ms.`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
async function requireExtensionBuilt(): Promise<string> {
  const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath))
    throw new Error(
      `Extensão não buildada em ${EXTENSION_ROOT}. Rode 'BUILD_MODE=development API_BASE=http://localhost:3000 pnpm extension:build:chrome' antes do E2E.`,
    );
  return manifestPath;
}
function readEntryPaths(manifestPath: string): { popup: string; sidePanel: string } {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    action?: { default_popup?: string };
    side_panel?: { default_path?: string };
    sidebar_action?: { default_path?: string };
    chrome_url_overrides?: { side_panel?: string };
  };
  const popup = m.action?.default_popup;
  const sidePanel = m.side_panel?.default_path ?? m.sidebar_action?.default_path ?? m.chrome_url_overrides?.side_panel;
  if (!popup) throw new Error('manifest.action.default_popup ausente');
  if (!sidePanel) throw new Error('manifest.side_panel.default_path (ou sidebar_action.default_path) ausente');
  // WXT gera nomes reais (popup.html/sidepanel.html ou subdiretórios); o E2E lê
  // diretamente do manifesto e NÃO presume nomes.
  return { popup: popup.replace(/^\.\//, ''), sidePanel: sidePanel.replace(/^\.\//, '') };
}

interface Seed {
  email: string;
  password: string;
  orgId: string;
  clientId: string;
  brandKitId: string;
  campaignId: string;
  assetId: string;
  assetMime: string;
}
const uid = () => crypto.randomBytes(6).toString('hex');

/**
 * Parser mínimo e válido de Set-Cookie (RFC 6265).
 *  - NÃO fornece `url` junto de `path`/`domain`.
 *  - Atributos sem `=` (HttpOnly, Secure) são reconhecidos.
 *  - `sameSite` só aceita Lax/Strict/None (default Lax).
 *  - Sem `as any`: o objeto retornado é estruturalmente válido para o Playwright.
 */
function toPlaywrightCookies(setCookie: string[], url: string): {
  name: string;
  value: string;
  url: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
}[] {
  const origin = new URL(url).origin;
  return setCookie.flatMap((sc) => {
    const parts = sc.split(';').map((s) => s.trim()).filter(Boolean);
    const first = parts[0];
    if (!first) return [];
    const eq = first.indexOf('=');
    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);
    const rest = parts.slice(1);
    let httpOnly = false;
    let secure = false;
    let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';
    for (const attr of rest) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') httpOnly = true;
      else if (lower === 'secure') secure = true;
      else if (lower.startsWith('samesite=')) {
        const v = attr.slice('samesite='.length).toLowerCase();
        if (v === 'strict' || v === 'none') sameSite = v === 'strict' ? 'Strict' : 'None';
        else sameSite = 'Lax';
      }
    }
    return { name, value, url: origin, httpOnly, secure, sameSite };
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
  const orgId = (reg.json as { organizationId: string }).organizationId;
  const login = await apiFetch('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status}`);
  if (!login.setCookie.length) throw new Error('login não retornou set-cookie');
  const cookie = login.setCookie.map((c) => c.split(';')[0]).join('; ');
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

  // Upload multipart REAL (PNG fixture) exigido pela rota /api/assets/upload.
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
    const u = new URL('/api/assets/upload', APP_URL);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request(
      u,
      {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          cookie,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            json: raw ? safeJson(raw) : null,
            headers: res.headers,
            setCookie: [],
          }),
        );
      },
    );
    r.on('error', reject);
    r.write(body);
    r.end();
  });
  if (asset.status !== 201) throw new Error(`asset: ${asset.status} ${JSON.stringify(asset.json)}`);
  const assetJson = asset.json as { id: string; mimeType?: string };
  const assetId = assetJson.id;
  const assetMime = assetJson.mimeType ?? 'image/png';
  if (assetMime !== 'image/png') throw new Error(`MIME detectado não é image/png: ${assetMime}`);
  return { seed: { email, password, orgId, clientId, brandKitId, campaignId, assetId, assetMime }, cookie };
}

test.describe('Fluxo PKCE completo (extensão real Chrome/Chromium)', () => {
  test('entrar, autorizar, gerar pacote e revogar', async () => {
    await requireAppUp();
    const manifestPath = await requireExtensionBuilt();
    const { popup: popupPath, sidePanel: sidePanelPath } = readEntryPaths(manifestPath);
    const { seed, cookie } = await seedState();

    const context = await chromium.launchPersistentContext('', {
      headless: !process.env.E2E_HEADED,
      // Chrome for Testing em modo headless com extensão + execução como root
      // (CI/containers) exige estes flags para não crashar o renderer ao abrir
      // uma nova aba via browser.tabs.create.
      args: [
        `--disable-extensions-except=${EXTENSION_ROOT}`,
        `--load-extension=${EXTENSION_ROOT}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      chromiumSandbox: false,
      // Garante suporte ao carregamento de extensão no modo headless do Playwright.
      channel: undefined,
    });
    try {
      // 1) Aplicação saudável: já validado por requireAppUp.

      // 2) Cookie de sessão web injetado ANTES do PKCE e validado DENTRO do navegador.
      await context.addCookies(
        toPlaywrightCookies(
          (await apiFetch('POST', '/api/auth/login', { email: seed.email, password: seed.password })).setCookie,
          APP_URL,
        ),
      );
      const mePage = context.pages()[0] ?? (await context.newPage());
      const me = await mePage.request.get('/api/auth/me');
      expect(me.status(), 'auth/me autenticado dentro do navegador').toBe(200);

      // 3) Extensão carregada + service worker disponível.
      const bg = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extId = new URL(bg.url()).hostname;

      // 4) Popup aberto.
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/${popupPath}`);

      // 5) Início do PKCE pelo popup — registra a promessa da página ANTES do clique.
      const authPagePromise = context.waitForEvent('page');
      await popup.getByRole('button', { name: /entrar|login/i }).click();
      const authPage = await authPagePromise;

      // 6) Página de autorização aberta.
      await authPage.waitForURL(/extension\/authorize/);
      await authPage.getByRole('button', { name: /autorizar|concordar/i }).click();

      // 7) Autorização aprovada + 8) exchange concluído no background + 9) popup autenticado.
      await popup.getByText(/autenticado|sess[aã]o v[aá]lida/i).first().waitFor({ timeout: 30_000 });

      // Captura o Bearer da extensão (token gravado no storage da extensão) para
      // validação posterior de revogação. Lê do contexto da popup (que tem `browser`).
      const extToken = (await popup.evaluate(async () => {
        // @ts-expect-error browser é global de webextension-polyfill no contexto da extensão
        const r = await browser.storage.local.get('mants_session');
        return (r.mants_session as { token?: string } | undefined)?.token ?? null;
      })) as string | null;
      expect(extToken, 'token da extensão capturado').toBeTruthy();
      if (!extToken) throw new Error('token da extensão não capturado');

      // Antes do logout: a sessão está ativa.
      const beforeRevoke = await apiFetch('GET', '/api/extension/session', undefined, `Bearer ${extToken}`);
      expect(beforeRevoke.status, 'sessão da extensão ativa antes do logout').toBe(200);

      // 10) Side panel aberto.
      const openSpPromise = context.waitForEvent('page');
      await popup.getByRole('button', { name: /painel lateral|side panel/i }).click();
      const sp = await openSpPromise;
      await sp.goto(`chrome-extension://${extId}/${sidePanelPath}`);

      // 11) Cliente selecionado.
      await sp.getByTestId('select-client').waitFor();
      await sp.getByTestId('select-client').selectOption({ value: seed.clientId });
      // 12) Brand Kit vinculado ao cliente selecionado.
      await sp.getByTestId('select-brandkit').selectOption({ value: seed.brandKitId });
      // 13) Campanha selecionada.
      await sp.getByTestId('select-campaign').selectOption({ value: seed.campaignId });
      // 14) Ativo selecionado — seletor determinístico via data-testid.
      await sp.getByTestId(`asset-${seed.assetId}`).check();
      const assetChecked = await sp.getByTestId(`asset-${seed.assetId}`).isChecked();
      expect(assetChecked, 'checkbox do ativo marcado').toBe(true);
      // 15) Objetivo e público preenchidos.
      await sp.getByTestId('input-objective').fill('Lançamento de verão');
      await sp.getByTestId('input-audience').fill('Jovens adultos');

      // 16) Prompt gerado sem LLM.
      await sp.getByTestId('generate-prompt').click();
      const promptText = await sp
        .getByText(/objetivo|p[úu]blico|tom de voz|diretrizes/i)
        .first()
        .innerText();
      expect(promptText.length, 'prompt gerado com conteúdo').toBeGreaterThan(10);

      // 17) Prompt editado e salvo.
      await sp.getByTestId('input-edited').fill(`${promptText}\nEditado para homologação.`);
      await sp.getByTestId('save-edit').click();
      await sp.getByText(/edi[çc][ãa]o salva|sucesso|salvo/i).first().waitFor({ timeout: 10_000 });

      // 18) ZIP baixado — registra o evento ANTES de clicar.
      const downloadPromise: Promise<Download> = sp.waitForEvent('download');
      await sp.getByTestId('download-package').click();
      const download = await downloadPromise;
      const dlPath = path.join(os.tmpdir(), download.suggestedFilename());
      await download.saveAs(dlPath);
      const fname = download.suggestedFilename();
      expect(fname.toLowerCase().endsWith('.zip'), 'arquivo é .zip').toBe(true);
      const st = fs.statSync(dlPath);
      expect(st.size, 'ZIP não vazio').toBeGreaterThan(0);
      // 19) ZIP inspecionável (contém manifesto JSON).
      await inspectZip(dlPath);

      // 20) Uso registrado.
      const usage = await apiFetch('POST', '/api/usage', { campaignId: seed.campaignId, brandKitId: seed.brandKitId }, cookie);
      expect([200, 201], 'uso registrado').toContain(usage.status);

      // 21) Logout (revoga Bearer da extensão + limpa storage da extensão).
      await popup.getByRole('button', { name: /logout|sair/i }).click();
      await popup.getByText(/n[ãa]o autenticado|fa[çc]a login|entrar na mants/i).first().waitFor({ timeout: 15_000 });

      // 22) Bearer antigo da extensão é rejeitado (401).
      const oldBearer = await apiFetch('GET', '/api/extension/session', undefined, `Bearer ${extToken}`);
      expect(oldBearer.status, 'Bearer antigo da extensão revogado (401)').toBe(401);

      // 23) Sessão correspondente marcada como revogada (via cookie web ainda válido).
      const list = await apiFetch('GET', '/api/extension/sessions', undefined, cookie);
      expect(list.status, 'lista de sessões com cookie web válido').toBe(200);
      const sessions = (list.json as { sessions: Array<{ id: string; deviceId: string; status: string; revokedAt: string | null }> }).sessions;
      // Localiza a sessão da extensão pelo deviceId presente no token da extensão.
      const extClaims = decodeJwt(extToken);
      const target = sessions.find((s) => s.deviceId === extClaims?.deviceId) ?? sessions.find((s) => s.status === 'revoked');
      expect(target, 'sessão da extensão localizada').toBeTruthy();
      expect(target!.status, 'sessão marcada revoked').toBe('revoked');
      expect(target!.revokedAt, 'revokedAt preenchido').toBeTruthy();
    } finally {
      await context.close();
    }
  });
});

/** Inspeciona o ZIP: confirma que é um ZIP válido e contém ao menos um manifesto JSON. */
async function inspectZip(zipPath: string): Promise<void> {
  const buf = fs.readFileSync(zipPath);
  // Assinatura PK\x03\x04 (local file header) ou PK\x05\x06 (empty archive).
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
  expect(isZip, 'assinatura ZIP presente').toBe(true);
  const str = buf.toString('latin1');
  expect(str.includes('.json'), 'ZIP contém arquivo JSON (manifesto)').toBe(true);
}

/** Decodifica o payload (claims) de um JWT sem verificar assinatura. */
function decodeJwt(token: string): { deviceId?: string; sub?: string } | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded) as { deviceId?: string; sub?: string };
  } catch {
    return null;
  }
}

// Firefox: NÃO iniciamos Firefox com Chromium. Mantemos apenas validação estática
// do manifesto Firefox (build existe), sem declarar E2E Firefox aprovado.
test.describe('Firefox (validação estática apenas)', () => {
  test('manifest Firefox existe', () => {
    const fx = path.join('apps/extension/.output', 'firefox-mv3', 'manifest.json');
    if (!fs.existsSync(fx)) {
      test.skip(true, 'build Firefox não presente neste ambiente');
      return;
    }
    expect(fs.existsSync(fx)).toBe(true);
  });
});
