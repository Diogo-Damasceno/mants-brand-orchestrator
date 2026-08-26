/**
 * Configuração centralizada da origem da API da extensão.
 * - Em desenvolvimento: localhost é permitido.
 * - Em produção: API_BASE deve estar presente e ser https; não há fallback silencioso.
 * - Rejeita pathname, query string, fragment e HTTP (exceto localhost em dev).
 * - host_permissions do manifesto usa exatamente essa origem.
 */
import type { CancelAuthPayload } from './messages';

function resolveApiBase(): string {
  // A origem da API vem EXCLUSIVAMENTE do valor injetado pelo build (__API_BASE__).
  // Não há fallback para host_permissions (o primeiro é chatgpt.com e jamais deve
  // ser interpretado como servidor da Mants). Se ausente, falha explicitamente.
  const fromDefine = typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : '';
  if (!fromDefine || fromDefine.trim() === '') {
    throw new Error(
      'API_BASE não configurado. Defina a origem real da API no build (define __API_BASE__). ' +
        'Não é aceito placeholder nem fallback para ChatGPT.',
    );
  }
  return validateApiOrigin(fromDefine);
}

/**
 * Detecta modo de build (produção vs desenvolvimento).
 * NÃO depende de process.env.NODE_ENV em runtime de extensão (process pode não
 * existir no navegador). Usa __MANTS_BUILD_MODE__ injetado pelo WXT/Vite.
 */
export function isProductionBuild(): boolean {
  const mode = typeof __MANTS_BUILD_MODE__ !== 'undefined' ? __MANTS_BUILD_MODE__ : '';
  return mode === 'production';
}

/** Valida e normaliza a origem da API. Lança em produção se inválida. */
export function validateApiOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`API_BASE inválido: ${raw}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`API_BASE deve ser uma origem pura (sem path/query/fragment): ${raw}`);
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'http:') {
    if (!isLocalhost) {
      throw new Error(`API_BASE HTTP só é permitido para localhost (dev): ${raw}`);
    }
    // Em produção, localhost HTTP é inaceitável (exige HTTPS).
    if (isProductionBuild()) {
      throw new Error(`API_BASE HTTP não é permitido em produção: ${raw}`);
    }
  } else if (url.protocol !== 'https:') {
    throw new Error(`API_BASE deve usar http(s): ${raw}`);
  }
  // Nenhum bundle de produção pode apontar para ChatGPT como API da Mants.
  if (url.hostname === 'chatgpt.com') {
    throw new Error('API_BASE não pode ser chatgpt.com (não é a API da Mants).');
  }
  return url.origin;
}

let _API_BASE: string | null = null;
export function getApiBase(): string {
  if (_API_BASE) return _API_BASE;
  _API_BASE = resolveApiBase();
  return _API_BASE;
}

export interface Session {
  token: string;
  userId: string;
  organizationId: string;
  roles: string[];
  expiresIn: number;
  expiresAt: number;
  deviceId: string;
}

export async function apiConfig(): Promise<{
  featureChatgptAssistedInsertion: boolean;
  extensionMinVersion: string;
}> {
  const res = await fetch(`${getApiBase()}/api/extension/config`);
  if (!res.ok) throw new Error('Falha ao obter configuração.');
  return res.json();
}

export interface StartAuthPayload {
  codeChallenge: string;
  deviceId: string;
  origin: string;
  stateHash: string;
  nonceHash: string;
  cancelSecretHash: string;
  browser: string;
  extensionVersion: string;
  extensionName: string;
}

/** Passo 1: inicia o fluxo PKCE no backend e devolve o código pendente. */
export async function startAuth(payload: StartAuthPayload): Promise<{ code: string }> {
  const res = await fetch(`${getApiBase()}/api/extension/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Falha ao iniciar autorização.');
  return data;
}

/** Passo 3: conclui o fluxo trocando o código por uma sessão da extensão. */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  deviceId: string,
  origin: string,
  state: string,
  nonce: string,
): Promise<Session> {
  const res = await fetch(`${getApiBase()}/api/extension/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, deviceId, origin, state, nonce }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Falha na troca de código.');
  return { ...data, expiresAt: Date.now() + (data.expiresIn ?? 0) * 1000, deviceId } as Session;
}

export async function revokeSession(token: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/extension/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao revogar sessão.');
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Poll controlado do status do código (usado pelo background para detectar
 * autorização sem depender do popup aberto). O código é um segredo não
 * adivinhável, portanto não expõe dados sensíveis.
 */
export interface AuthPollResult {
  authorized: boolean;
  cancelled: boolean;
  expired: boolean;
  error?: string;
}

export async function pollAuthStatus(code: string): Promise<AuthPollResult> {
  const res = await fetch(`${getApiBase()}/api/extension/auth/poll?code=${encodeURIComponent(code)}`);
  if (!res.ok) return { authorized: false, cancelled: false, expired: false, error: 'poll_failed' };
  const data = (await res.json()) as Partial<AuthPollResult>;
  return {
    authorized: Boolean(data.authorized),
    cancelled: Boolean(data.cancelled),
    expired: Boolean(data.expired),
  };
}

/** Cancela um fluxo pendente junto ao backend (code + cancelSecret, sem cookie/Bearer). */
export async function cancelAuth(payload: CancelAuthPayload): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/extension/auth/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Falha ao cancelar.');
  }
}

/**
 * Download autenticado de um pacote: usa fetch com Bearer e devolve o Blob.
 * O chamador gera a URL temporária e inicia o download (sem expor token na URL).
 */
export async function downloadPackageBlob(id: string, token: string): Promise<Blob> {
  const res = await fetch(`${getApiBase()}/api/packages/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.blob();
}

/** Registra utilização de um prompt (retorna ok/falha; o chamador decide a UI). */
export async function registerPromptUsage(promptId: string, token: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/prompts/${promptId}/usage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}
