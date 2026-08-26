import { ChatSurfaceAdapter } from '../modules/chat-surface';
import {
  generateDeviceId,
  saveSession,
  getSession,
  clearSession,
} from '../modules/storage';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  generateNonce,
  sha256Hex,
} from '../modules/pkce';
import {
  startAuth,
  exchangeCode,
  cancelAuth,
  pollAuthStatus,
  getApiBase,
} from '../modules/api';
import {
  savePendingFlow,
  getPendingFlow,
  clearPendingFlow,
  saveAuthStatus,
  getAuthStatus,
} from '../modules/flow-state';
import type {
  ExtensionMessage,
  AuthStatus,
  PendingFlow,
  StartAuthResult,
  GetAuthStatusResult,
  GetSessionResult,
  InsertTextResult,
  LogoutResult,
  CancelFlowResult,
} from '../modules/messages';

// Background service worker: dono do fluxo PKCE durável.
// O popup pode fechar; o background persiste o fluxo e conclui o exchange.

const FLOW_TTL_MS = 10 * 60_000; // 10 minutos (espelha o backend)
const POLL_INTERVAL_MS = 2_000;
const POLL_BACKOFF_MS = 1_500;
const POLL_MAX_INTERVAL_MS = 15_000;

let pollTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(status: AuthStatus): void {
  void saveAuthStatus(status);
  browser.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', status }).catch(() => undefined);
}

function idleStatus(): AuthStatus {
  return { phase: 'idle', code: null, error: null };
}

function isExpired(flow: PendingFlow): boolean {
  return Date.now() > flow.createdAt + FLOW_TTL_MS;
}

async function beginExchange(flow: PendingFlow): Promise<void> {
  broadcast({ phase: 'exchanging', code: flow.code, error: null });
  try {
    const session = await exchangeCode(
      flow.code,
      flow.codeVerifier,
      flow.deviceId,
      flow.origin,
      flow.state,
      flow.nonce,
    );
    // Sucesso: apaga segredos temporários imediatamente.
    await clearPendingFlow();
    await saveSession(session);
    broadcast({ phase: 'authenticated', code: null, error: null });
    browser.runtime.sendMessage({ type: 'SESSION_CHANGED', session }).catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na troca de código.';
    await clearPendingFlow();
    broadcast({ phase: 'error', code: null, error: msg });
  } finally {
    stopPolling();
  }
}

function schedulePoll(flow: PendingFlow, interval: number): void {
  stopPolling();
  pollTimer = setTimeout(() => {
    void pollAndAdvance(flow, interval);
  }, interval);
  // Não mantém o service worker vivo sozinho: o timer do SW cuida disso em MV3.
  void browser.runtime.getManifest();
}

async function pollAndAdvance(flow: PendingFlow, interval: number): Promise<void> {
  // Se o fluxo sumiu (cancelado por outro lado), para.
  const current = await getPendingFlow();
  if (!current || current.code !== flow.code) {
    stopPolling();
    return;
  }
  if (isExpired(flow)) {
    await clearPendingFlow();
    stopPolling();
    broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
    return;
  }
  try {
    const status = await pollAuthStatus(flow.code);
    if (status.authorized) {
      await beginExchange(flow);
      return;
    }
    if (status.cancelled) {
      await clearPendingFlow();
      stopPolling();
      broadcast({ phase: 'idle', code: null, error: 'Autorização cancelada.' });
      return;
    }
    if (status.expired) {
      await clearPendingFlow();
      stopPolling();
      broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
      return;
    }
    // Ainda não autorizado: backoff controlado, sem sobrecarregar a API.
    const next = Math.min(interval + POLL_BACKOFF_MS, POLL_MAX_INTERVAL_MS);
    schedulePoll(flow, next);
  } catch {
    // Falha de rede transitória: tenta de novo com backoff.
    const next = Math.min(interval + POLL_BACKOFF_MS, POLL_MAX_INTERVAL_MS);
    schedulePoll(flow, next);
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function startFlow(): Promise<StartAuthResult> {
  try {
    const manifest = browser.runtime.getManifest();
    const extensionVersion = manifest.version ?? '0.1.0';
    const deviceId = await generateDeviceId();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await deriveCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();
    const stateHash = await sha256Hex(state);
    const nonceHash = await sha256Hex(nonce);
    const origin = getApiBase();
    const browserName = browser.runtime.getURL('').includes('moz-extension') ? 'Firefox' : 'Chrome';

    const { code } = await startAuth({
      codeChallenge,
      deviceId,
      origin,
      stateHash,
      nonceHash,
      browser: browserName,
      extensionVersion,
      extensionName: 'Mants Brand Orchestrator',
    });

    const flow: PendingFlow = {
      code,
      codeVerifier,
      state,
      nonce,
      deviceId,
      origin,
      browser: browserName,
      extensionVersion,
      extensionName: 'Mants Brand Orchestrator',
      createdAt: Date.now(),
    };

    // Persiste ANTES de abrir a aba (sobrevive à suspensão do SW).
    await savePendingFlow(flow);
    broadcast({ phase: 'awaiting_user', code, error: null });

    await browser.tabs.create({
      url: `${origin}/extension/authorize?code=${encodeURIComponent(code)}`,
    });

    // Inicia o polling controlado para concluir o exchange após a autorização.
    schedulePoll(flow, POLL_INTERVAL_MS);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao iniciar login.';
    broadcast({ phase: 'error', code: null, error: msg });
    return { ok: false, error: msg };
  }
}

async function cancelFlow(): Promise<CancelFlowResult> {
  const flow = await getPendingFlow();
  if (!flow) return { ok: true };
  try {
    await cancelAuth(flow.code);
  } catch {
    // Mesmo se o backend falhar, limpamos o estado local.
  }
  await clearPendingFlow();
  stopPolling();
  broadcast({ phase: 'idle', code: null, error: 'Fluxo cancelado.' });
  return { ok: true };
}

async function logout(): Promise<LogoutResult> {
  const session = await getSession<{ token: string }>();
  if (session?.token) {
    try {
      await import('../modules/api').then((m) => m.revokeSession(session.token));
    } catch {
      /* ignore */
    }
  }
  await clearSession();
  await clearPendingFlow();
  stopPolling();
  broadcast(idleStatus());
  browser.runtime.sendMessage({ type: 'SESSION_CHANGED', session: null }).catch(() => undefined);
  return { ok: true };
}

/** Recupera fluxo pendente após o SW ser suspenso/reiniciado. */
async function recoverPendingFlow(): Promise<void> {
  const flow = await getPendingFlow();
  if (!flow) return;
  if (isExpired(flow)) {
    await clearPendingFlow();
    broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
    return;
  }
  // Retoma o polling a partir do estado persistido.
  broadcast({ phase: 'awaiting_user', code: flow.code, error: null });
  schedulePoll(flow, POLL_INTERVAL_MS);
}

/** Localiza a aba ativa do chatgpt.com e entrega a mensagem ao content script. */
async function insertIntoChatGpt(text: string): Promise<InsertTextResult> {
  try {
    const tabs = await browser.tabs.query({ url: 'https://chatgpt.com/*', active: true });
    const target = tabs[0];
    if (!target?.id) {
      return { ok: false, reason: 'Nenhuma aba do ChatGPT ativa.' };
    }
    const r = await browser.tabs.sendMessage(target.id, { type: 'INSERT_TEXT', text });
    return (r as InsertTextResult) ?? { ok: false, reason: 'Sem resposta do content script.' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Falha ao enviar ao ChatGPT.' };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.log('[Mants] extensão instalada.');
  });

  // Ao iniciar (recuperação de SW suspenso/reiniciado).
  void recoverPendingFlow();

  browser.runtime.onMessage.addListener(
    async (msg: ExtensionMessage, _sender, sendResponse) => {
      switch (msg.type) {
        case 'START_AUTH': {
          const r = await startFlow();
          sendResponse(r as StartAuthResult);
          return true;
        }
        case 'GET_AUTH_STATUS': {
          const status = await getAuthStatus();
          sendResponse({ status } as GetAuthStatusResult);
          return true;
        }
        case 'GET_SESSION': {
          const session = await getSession();
          sendResponse({ session } as GetSessionResult);
          return true;
        }
        case 'CANCEL_FLOW': {
          const r = await cancelFlow();
          sendResponse(r as CancelFlowResult);
          return true;
        }
        case 'LOGOUT': {
          const r = await logout();
          sendResponse(r as LogoutResult);
          return true;
        }
        case 'INSERT_TEXT': {
          const r = await insertIntoChatGpt(msg.text);
          sendResponse(r as InsertTextResult);
          return true;
        }
        case 'OPEN_CHATGPT': {
          await browser.tabs.create({ url: 'https://chatgpt.com/' });
          return;
        }
        default:
          return false;
      }
    },
  );

  // O background NÃO manipula o DOM diretamente. O ChatSurfaceAdapter é usado
  // apenas pelo content script no contexto da página do ChatGPT.
  void ChatSurfaceAdapter;
});
