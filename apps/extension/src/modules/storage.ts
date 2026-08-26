import type { PendingFlow, ExtensionSession } from './protocol';

const SESSION_KEY = 'mants_session';
const PENDING_FLOW_KEY = 'mants_pending_flow';
const DEVICE_ID_KEY = 'mants_device_id';

export async function saveSession(session: ExtensionSession): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}

export async function getSession<T = ExtensionSession>(): Promise<T | null> {
  const r = await browser.storage.local.get(SESSION_KEY);
  return (r[SESSION_KEY] as T) ?? null;
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}

/** Persiste o fluxo PKCE temporário ANTES de abrir a aba de autorização. */
export async function savePendingFlow(flow: PendingFlow): Promise<void> {
  await browser.storage.local.set({ [PENDING_FLOW_KEY]: flow });
}

export async function getPendingFlow(): Promise<PendingFlow | null> {
  const r = await browser.storage.local.get(PENDING_FLOW_KEY);
  return (r[PENDING_FLOW_KEY] as PendingFlow) ?? null;
}

/** Apaga os segredos temporários (verifier/state/nonce) imediatamente. */
export async function clearPendingFlow(): Promise<void> {
  await browser.storage.local.remove(PENDING_FLOW_KEY);
}

export async function getDeviceId(): Promise<string> {
  const r = await browser.storage.local.get(DEVICE_ID_KEY);
  if (r[DEVICE_ID_KEY]) return r[DEVICE_ID_KEY] as string;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ [DEVICE_ID_KEY]: id });
  return id;
}
