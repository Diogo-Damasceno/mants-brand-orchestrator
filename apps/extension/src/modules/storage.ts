1|2|
3|const SESSION_KEY = 'mants_session';
4|const ACTIVE_ORG_KEY = 'mants_active_org';
5|
6|export async function saveSession(session: unknown): Promise<void> {
7|  await browser.storage.local.set({ [SESSION_KEY]: session });
8|}
9|
10|export async function getSession<T = unknown>(): Promise<T | null> {
11|  const r = await browser.storage.local.get(SESSION_KEY);
12|  return (r[SESSION_KEY] as T) ?? null;
13|}
14|
15|export async function clearSession(): Promise<void> {
16|  await browser.storage.local.remove(SESSION_KEY);
17|}
18|
19|export async function setActiveOrg(orgId: string): Promise<void> {
20|  await browser.storage.local.set({ [ACTIVE_ORG_KEY]: orgId });
21|}
22|
23|export async function getActiveOrg(): Promise<string | null> {
24|  const r = await browser.storage.local.get(ACTIVE_ORG_KEY);
25|  return (r[ACTIVE_ORG_KEY] as string) ?? null;
26|}
27|
28|export async function generateDeviceId(): Promise<string> {
29|  const r = await browser.storage.local.get('mants_device_id');
30|  if (r.mants_device_id) return r.mants_device_id as string;
31|  const id = crypto.randomUUID();
32|  await browser.storage.local.set({ mants_device_id: id });
33|  return id;
34|}
35|