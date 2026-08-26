/**
 * Estado durável do fluxo PKCE no background service worker.
 *
 * O popup pode ser fechado a qualquer momento; o background é quem detém o fluxo.
 * O fluxo pendente é persistido em browser.storage.local ANTES de abrir a aba de
 * autorização, de modo que, se o service worker for suspenso/reiniciado, ele possa
 * recuperar o fluxo e concluir o exchange (polling controlado).
 *
 * Os segredos temporários (codeVerifier, state, nonce) são apagados imediatamente
 * após sucesso, expiração ou cancelamento.
 */
import type { AuthStatus, PendingFlow } from './messages';

const FLOW_KEY = 'mants_pending_flow';
const STATUS_KEY = 'mants_auth_status';

export async function savePendingFlow(flow: PendingFlow): Promise<void> {
  await browser.storage.local.set({ [FLOW_KEY]: flow });
}

export async function getPendingFlow(): Promise<PendingFlow | null> {
  const r = await browser.storage.local.get(FLOW_KEY);
  return (r[FLOW_KEY] as PendingFlow) ?? null;
}

export async function clearPendingFlow(): Promise<void> {
  await browser.storage.local.remove(FLOW_KEY);
}

export async function saveAuthStatus(status: AuthStatus): Promise<void> {
  await browser.storage.local.set({ [STATUS_KEY]: status });
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const r = await browser.storage.local.get(STATUS_KEY);
  return (r[STATUS_KEY] as AuthStatus) ?? { phase: 'idle', code: null, error: null };
}
