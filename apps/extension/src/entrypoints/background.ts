import { generatePkceSecrets, getDeviceId } from '../modules/pkce';
import {
  savePendingFlow,
  getPendingFlow,
  clearPendingFlow,
  saveSession,
  getSession,
  clearSession,
} from '../modules/storage';
import {
  startAuth,
  authStatus,
  exchangeCode,
  cancelFlow,
  revokeSession,
  getApiBase,
} from '../modules/api';
import type { BackgroundRequest, AuthStatus, PendingFlow } from '../modules/protocol';

// Configuração de polling/backoff.
const POLL_INTERVAL_MS = 2_000;
const POLL_INTERVAL_MAX_MS = 15_000;
const BACKOFF_FACTOR = 1.6;
const FLOW_TTL_MS = 10 * 60_000; // 10 minutos (mesmo TTL do backend)

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let activeNotify: (() => void) | null = null;

function notify(): void {
  activeNotify?.();
  // Avisa popup/sidepanel abertos.
  browser.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => undefined);
}

/** Limpa o timer de polling. */
function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/** Agenda o próximo poll com backoff. */
function schedulePoll(flow: PendingFlow): void {
  stopPolling();
  if (Date.now() > flow.expiresAt) {
    void failFlow('Tempo de autorização expirado. Tente novamente.');
    return;
  }
  const interval = Math.min(
    POLL_INTERVAL_MAX_MS,
    POLL_INTERVAL_MS * Math.pow(BACKOFF_FACTOR, flow.attempts),
  );
  pollTimer = setTimeout(() => void pollOnce().catch(() => undefined), interval);
}

/** Tenta o exchange; diferencia "ainda não autorizado" de erro definitivo. */
async function pollOnce(): Promise<void> {
  const flow = await getPendingFlow();
  if (!flow) return;
  // Expirado?
  if (Date.now() > flow.expiresAt) {
    await failFlow('Tempo de autorização expirado. Tente novamente.');
    return;
  }
  // Protege contra múltiplas sessões: se já autenticado, para.
  const existing = await getSession();
  if (existing) {
    await clearPendingFlow();
    stopPolling();
    notify();
    return;
  }

  let status: string;
  try {
    const res = await authStatus(flow.code, flow.deviceId);
    status = res.status;
  } catch {
    // Erro de rede transitório: reagenda sem contar como tentativa de exchange.
    schedulePoll({ ...flow, lastPoll: Date.now() });
    return;
  }

  if (status === 'pending' || status === 'not_found') {
    // Ainda não autorizado: continua pollando (backoff).
    schedulePoll({ ...flow, attempts: flow.attempts + 1, lastPoll: Date.now() });
    broadcastStatus(await buildStatus());
    return;
  }

  if (status === 'cancelled') {
    await failFlow('Autorização cancelada pelo usuário.');
    return;
  }

  if (status === 'expired') {
    await failFlow('Código de autorização expirado.');
    return;
  }

  if (status === 'authorized' || status === 'used') {
    // Usuário autorizou: faz o exchange.
    await doExchange(flow);
    return;
  }

  // Estado desconhecido: reagenda.
  schedulePoll({ ...flow, attempts: flow.attempts + 1, lastPoll: Date.now() });
}

/** Executa o exchange e salva a sessão; limpa segredos. */
async function doExchange(flow: PendingFlow): Promise<void> {
  try {
    const session = await exchangeCode({
      code: flow.code,
      codeVerifier: flow.codeVerifier,
      deviceId: flow.deviceId,
      origin: flow.origin,
      state: flow.state,
      nonce: flow.nonce,
    });
    await saveSession(session);
    await clearPendingFlow(); // apaga verifier/state/nonce imediatamente
    stopPolling();
    notify();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha no exchange.';
    // Erro definitivo (ex.: PKCE inválido) — não fica em loop.
    await failFlow(msg);
  }
}

async function failFlow(message: string): Promise<void> {
  await clearPendingFlow();
  stopPolling();
  await browser.storage.local.set({ mants_last_auth_error: message });
  notify();
}

/** Reconstrói o estado observável a partir do storage. */
async function buildStatus(): Promise<AuthStatus> {
  const session = await getSession();
  if (session && Date.now() < (session.expiresAt ?? 0)) {
    return { phase: 'authenticated', session };
  }
  if (session && Date.now() >= (session.expiresAt ?? 0)) {
    await clearSession();
    return { phase: 'expired' };
  }
  const flow = await getPendingFlow();
  if (flow) {
    if (Date.now() > flow.expiresAt) return { phase: 'expired' };
    if (flow.code) {
      return {
        phase: 'awaiting_authorization',
        code: flow.code,
        deviceId: flow.deviceId,
        expiresAt: flow.expiresAt,
      };
    }
  }
  return { phase: 'idle' };
}

function broadcastStatus(status: AuthStatus): void {
  browser.runtime.sendMessage({ type: 'AUTH_STATUS', status }).catch(() => undefined);
}

/** Inicia o fluxo PKCE completo no background. */
async function beginAuth(browserName: string, extensionVersion: string, extensionName: string): Promise<string> {
  stopPolling();
  const deviceId = await getDeviceId();
  const secrets = await generatePkceSecrets();
  const origin = getApiBase();
  const now = Date.now();
  const flow: PendingFlow = {
    code: '',
    codeVerifier: secrets.codeVerifier,
    codeChallenge: secrets.codeChallenge,
    state: secrets.state,
    stateHash: secrets.stateHash,
    nonce: secrets.nonce,
    nonceHash: secrets.nonceHash,
    deviceId,
    origin,
    browser: browserName,
    extensionVersion,
    extensionName,
    startedAt: now,
    expiresAt: now + FLOW_TTL_MS,
    attempts: 0,
    lastPoll: now,
  };
  // Persiste ANTES de chamar o backend (recuperação pós-reinício do SW).
  await savePendingFlow(flow);
  try {
    const { code } = await startAuth({
      codeChallenge: secrets.codeChallenge,
      deviceId,
      origin,
      stateHash: secrets.stateHash,
      nonceHash: secrets.nonceHash,
      browser: browserName,
      extensionVersion,
      extensionName,
    });
    flow.code = code;
    await savePendingFlow(flow);
  } catch (e) {
    await clearPendingFlow();
    throw e;
  }

  // Abre a página de autorização em aba real.
  const url = `${origin}/extension/authorize?code=${encodeURIComponent(code)}`;
  await browser.tabs.create({ url });

  // Inicia o polling de exchange (resiliente a reinício do SW).
  schedulePoll(flow);
  return code;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    // Recupera fluxo pendente se o SW foi suspenso/reiniciado.
    void recoverPendingFlow();
  });

  browser.runtime.onMessage.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'START_AUTH': {
        beginAuth(msg.browser, msg.extensionVersion, msg.extensionName)
          .then((code) => sendResponse({ type: 'AUTH_STARTED', code }))
          .catch((e) =>
            sendResponse({ type: 'AUTH_START_FAILED', error: e instanceof Error ? e.message : 'Erro' }),
          );
        return true;
      }
      case 'GET_AUTH_STATUS': {
        buildStatus()
          .then((status) => sendResponse({ type: 'AUTH_STATUS', status }))
          .catch(() => sendResponse({ type: 'AUTH_STATUS', status: { phase: 'idle' } }));
        return true;
      }
      case 'CANCEL_FLOW': {
        void cancelCurrentFlow();
        sendResponse({ type: 'FLOW_CANCELLED' });
        return true;
      }
      case 'LOGOUT': {
        void logout();
        sendResponse({ type: 'LOGOUT_DONE' });
        return true;
      }
      case 'INSERT_TEXT': {
        handleInsertText(msg.text)
          .then((r) => sendResponse({ type: 'INSERT_RESULT', ok: r.ok, reason: r.reason }))
          .catch((e) => sendResponse({ type: 'INSERT_RESULT', ok: false, reason: e instanceof Error ? e.message : 'erro' }));
        return true;
      }
      case 'OPEN_CHATGPT': {
        browser.tabs.create({ url: 'https://chatgpt.com/' });
        sendResponse({ type: 'OPENED_CHATGPT' });
        return true;
      }
    }
    return false;
  });
});

/** Recupera fluxo pendente após reinício do SW e retoma o polling. */
async function recoverPendingFlow(): Promise<void> {
  const flow = await getPendingFlow();
  if (!flow || !flow.code) return;
  if (Date.now() > flow.expiresAt) {
    await clearPendingFlow();
    return;
  }
  const session = await getSession();
  if (session) {
    await clearPendingFlow();
    return;
  }
  schedulePoll(flow);
}

async function cancelCurrentFlow(): Promise<void> {
  const flow = await getPendingFlow();
  if (!flow || !flow.code) return;
  const session = await getSession();
  try {
    await cancelFlow(flow.code, session?.token);
  } catch {
    /* ignore */
  }
  await clearPendingFlow();
  stopPolling();
  notify();
}

async function logout(): Promise<void> {
  const session = await getSession();
  const flow = await getPendingFlow();
  if (session?.token) await revokeSession(session.token).catch(() => undefined);
  if (flow?.code) await cancelFlow(flow.code, session?.token).catch(() => undefined);
  await clearSession();
  await clearPendingFlow();
  stopPolling();
  notify();
}

/**
 * Inserção de texto no ChatGPT: o background localiza a aba ativa do chatgpt.com
 * e envia a mensagem ao content script, que chama ChatSurfaceAdapter.insertText().
 * O background NÃO manipula o DOM diretamente.
 */
async function handleInsertText(text: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const tabs = await browser.tabs.query({ url: 'https://chatgpt.com/*', active: true });
    const target = tabs[0];
    if (!target?.id) return { ok: false, reason: 'Nenhuma aba ativa do ChatGPT encontrada.' };
    const resp = await browser.tabs.sendMessage(target.id, { type: 'INSERT_TEXT', text });
    if (resp && typeof resp.ok === 'boolean') return { ok: resp.ok, reason: resp.reason };
    return { ok: false, reason: 'Resposta inesperada do content script.' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Falha ao enviar à aba.' };
  }
}
