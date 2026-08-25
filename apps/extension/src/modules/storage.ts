
const SESSION_KEY = 'mants_session';
const ACTIVE_ORG_KEY = 'mants_active_org';

export async function saveSession(session: unknown): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}

export async function getSession<T = unknown>(): Promise<T | null> {
  const r = await browser.storage.local.get(SESSION_KEY);
  return (r[SESSION_KEY] as T) ?? null;
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}

export async function setActiveOrg(orgId: string): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_ORG_KEY]: orgId });
}

export async function getActiveOrg(): Promise<string | null> {
  const r = await browser.storage.local.get(ACTIVE_ORG_KEY);
  return (r[ACTIVE_ORG_KEY] as string) ?? null;
}

export async function generateDeviceId(): Promise<string> {
  const r = await browser.storage.local.get('mants_device_id');
  if (r.mants_device_id) return r.mants_device_id as string;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ mants_device_id: id });
  return id;
}
