/**
 * Cliente HTTP da extensão, centralizado.
 * - descobre a API base a partir de __API_BASE__ (build) ou host_permissions[0];
 * - NUNCA hardcoded localhost:3000 em produção (config por ambiente);
 * - trata 401 de forma central: limpa sessão, notifica popup/sidepanel, pede novo login.
 */

const API_BASE: string =
  (typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : '') ||
  (typeof browser !== 'undefined' && browser.runtime?.getManifest?.()?.host_permissions?.[0]
    ? new URL(browser.runtime.getManifest().host_permissions[0]).origin
    : '') ||
  'http://localhost:3000';

export interface ExtensionSession {
  token: string;
  userId: string;
  organizationId: string;
  roles: string[];
  expiresIn: number;
}

export interface ApiConfig {
  featureChatgptAssistedInsertion: boolean;
  extensionMinVersion: string;
  extensionAllowedApiOrigin: string;
  appUrl: string;
}

export function getApiBase(): string {
  return API_BASE;
}

export function getManifestVersion(): string {
  try {
    return browser.runtime.getManifest()?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    await handleUnauthorized();
    throw new ApiHttpError(401, 'Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiHttpError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}
async function handleUnauthorized(): Promise<void> {
  await clearSession().catch(() => {});
  try {
    browser.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
  } catch {
    /* ignore */
  }
  onUnauthorized?.();
}

export async function apiConfig(): Promise<ApiConfig> {
  return request<ApiConfig>('/api/extension/config', { method: 'GET' });
}

export async function startAuth(payload: {
  codeChallenge: string;
  deviceId: string;
  origin: string;
  stateHash: string;
  nonceHash: string;
  browser: string;
  extensionVersion: string;
  extensionName: string;
}): Promise<{ code: string }> {
  return request<{ code: string }>('/api/extension/auth/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function authStatus(code: string, deviceId: string): Promise<{
  status: 'pending' | 'authorized' | 'used' | 'expired' | 'cancelled' | 'not_found';
  authorized: boolean;
  organizationId: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/extension/auth/status?code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new ApiHttpError(res.status, 'Falha ao consultar status');
  return res.json();
}

export async function exchangeCode(payload: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  origin: string;
  state: string;
  nonce: string;
}): Promise<ExtensionSession> {
  return request<ExtensionSession>('/api/extension/auth/exchange', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelFlow(code: string, token?: string): Promise<void> {
  await request('/api/extension/auth/cancel', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, token);
}

export async function revokeSession(token: string): Promise<void> {
  await request('/api/extension/sessions', { method: 'POST' }, token).catch(() => undefined);
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  return request<T>(path, { method: 'GET' }, token);
}

export async function apiPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, token);
}

export async function apiPatch<T>(path: string, token: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }, token);
}

/** Download autenticado -> Blob -> URL temporária (envia Bearer). */
export async function authenticatedDownload(path: string, token: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    await handleUnauthorized();
    throw new ApiHttpError(401, 'Sessão expirada.');
  }
  if (!res.ok) throw new ApiHttpError(res.status, `Erro ${res.status} no download`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function saveSession(session: ExtensionSession): Promise<void> {
  await browser.storage.local.set({ mants_session: session });
}

export async function getSession<T = ExtensionSession>(): Promise<T | null> {
  const r = await browser.storage.local.get('mants_session');
  return (r.mants_session as T) ?? null;
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove('mants_session');
}
