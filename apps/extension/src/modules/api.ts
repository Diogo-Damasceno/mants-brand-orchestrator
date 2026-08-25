1|2|
3|const API_BASE = 'http://localhost:3000';
4|
5|export interface Session {
6|  token: string;
7|  userId: string;
8|  organizationId: string;
9|  roles: string[];
10|  expiresIn: number;
11|}
12|
13|export async function apiConfig(): Promise<{ featureChatgptAssistedInsertion: boolean; extensionMinVersion: string }> {
14|  const res = await fetch(`${API_BASE}/api/extension/config`);
15|  if (!res.ok) throw new Error('Falha ao obter configuração.');
16|  return res.json();
17|}
18|
19|export async function exchangeCode(code: string, codeVerifier: string, deviceId: string, origin: string): Promise<Session> {
20|  const res = await fetch(`${API_BASE}/api/auth`, {
21|    method: 'POST',
22|    headers: { 'Content-Type': 'application/json' },
23|    body: JSON.stringify({ code, codeVerifier, deviceId, origin }),
24|  });
25|  const data = await res.json();
26|  if (!res.ok) throw new Error(data.error ?? 'Falha na troca de código.');
27|  return data;
28|}
29|
30|export async function revokeSession(token: string): Promise<void> {
31|  await fetch(`${API_BASE}/api/extension/revoke`, {
32|    method: 'POST',
33|    headers: { Authorization: *** ${token}` },
34|  });
35|}
36|
37|export async function apiGet<T>(path: string, token: string): Promise<T> {
38|  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: *** ${token}` } });
39|  if (!res.ok) throw new Error(`Erro ${res.status}`);
40|  return res.json() as Promise<T>;
41|}
42|