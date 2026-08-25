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

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  deviceId: string,
  origin: string,
): Promise<Session> {
  const res = await fetch(`${API_BASE}/api/extension/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, deviceId, origin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Falha na troca de código.');
  return data;
}

export async function revokeSession(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/extension/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
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
