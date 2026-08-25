
const API_BASE = 'http://localhost:3000';

export interface Session {
  token: string;
  userId: string;
  organizationId: string;
  roles: string[];
  expiresIn: number;
}

export async function apiConfig(): Promise<{ featureChatgptAssistedInsertion: boolean; extensionMinVersion: string }> {
  const res = await fetch(`${API_BASE}/api/extension/config`);
  if (!res.ok) throw new Error('Falha ao obter configuração.');
  return res.json();
}

export async function exchangeCode(code: string, codeVerifier: string, deviceId: string, origin: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, deviceId, origin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Falha na troca de código.');
  return data;
}

export async function revokeSession(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/extension/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}
