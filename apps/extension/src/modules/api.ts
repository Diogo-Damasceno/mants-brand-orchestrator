/**
 * Cliente HTTP da extensão.
 * API_BASE vem da configuração de build (define) ou da origem da página,
 * nunca hardcoded em produção.
 */
const API_BASE: string =
  (typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : '') ||
  (typeof browser !== 'undefined' && browser.runtime?.getManifest?.()?.host_permissions?.[0]
    ? new URL(browser.runtime.getManifest().host_permissions[0]).origin
    : '') ||
  'http://localhost:3000';

export interface Session {
  token: string;
  userId: string;
  organizationId: string;
  roles: string[];
  expiresIn: number;
  expiresAt: number;
  deviceId: string;
}

export function getApiBase(): string {
  return API_BASE;
}

export async function apiConfig(): Promise<{
  featureChatgptAssistedInsertion: boolean;
  extensionMinVersion: string;
}> {
  const res = await fetch(`${API_BASE}/api/extension/config`);
  if (!res.ok) throw new Error('Falha ao obter configuração.');
  return res.json();
}

export interface StartAuthPayload {
  codeChallenge: string;
  deviceId: string;
  origin: string;
  stateHash: string;
  nonceHash: string;
  browser: string;
  extensionVersion: string;
  extensionName: string;
}

/** Passo 1: inicia o fluxo PKCE no backend e devolve o código pendente. */
export async function startAuth(payload: StartAuthPayload): Promise<{ code: string }> {
  const res = await fetch(`${API_BASE}/api/extension/auth/start`, {
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
  const res = await fetch(`${API_BASE}/api/extension/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, deviceId, origin, state, nonce }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Falha na troca de código.');
  return { ...data, expiresAt: Date.now() + (data.expiresIn ?? 0) * 1000, deviceId } as Session;
}

export async function revokeSession(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/extension/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Falha ao revogar sessão.');
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
  const res = await fetch(`${API_BASE}/api/extension/auth/poll?code=${encodeURIComponent(code)}`);
  if (!res.ok) return { authorized: false, cancelled: false, expired: false, error: 'poll_failed' };
  const data = (await res.json()) as Partial<AuthPollResult>;
  return {
    authorized: Boolean(data.authorized),
    cancelled: Boolean(data.cancelled),
    expired: Boolean(data.expired),
  };
}

/** Cancela um fluxo pendente junto ao backend. */
export async function cancelAuth(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/extension/auth/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
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
  const res = await fetch(`${API_BASE}/api/packages/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.blob();
}

/** Registra utilização de um prompt (retorna ok/falha; o chamador decide a UI). */
export async function registerPromptUsage(promptId: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/prompts/${promptId}/usage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}
