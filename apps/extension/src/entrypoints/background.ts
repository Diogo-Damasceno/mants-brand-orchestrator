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
  savePollInterval,
  getPollInterval,
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
  CancelAuthPayload,
} from '../modules/messages';

// Background service worker: dono do fluxo PKCE durável.
// O popup pode fechar; o background persiste o fluxo e conclui o exchange.
// A recuperação após suspensão do SW usa browser.alarms (não setTimeout).

const FLOW_TTL_MS = 10 * 60_000; // 10 minutos (espelha o backend)
const ALARM_NAME = 'mants_pkce_poll';
const POLL_INTERVAL_MS = 2_000; // intervalo base do alarme (backoff aplicado por contador)
const POLL_BACKOFF_STEP = 1_500;
const POLL_MAX_INTERVAL_MS = 15_000;

function broadcast(status: AuthStatus): void {
  void saveAuthStatus(status);
  void browser.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', status }).catch(() => undefined);
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
    await clearAlarm();
    await saveSession(session);
    broadcast({ phase: 'authenticated', code: null, error: null });
    void browser.runtime.sendMessage({ type: 'SESSION_CHANGED', session }).catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na troca de código.';
    await clearPendingFlow();
    await clearAlarm();
    broadcast({ phase: 'error', code: null, error: msg });
  }
}

async function pollAndAdvance(flow: PendingFlow): Promise<number> {
  // Se o fluxo sumiu (cancelado por outro lado), para.
  const current = await getPendingFlow();
  if (!current || current.code !== flow.code) {
    await clearAlarm();
    return 0;
  }
  if (isExpired(flow)) {
    await clearPendingFlow();
    await clearAlarm();
    broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
    return 0;
  }
  try {
    const status = await pollAuthStatus(flow.code);
    if (status.authorized) {
      await beginExchange(flow);
      return 0;
    }
    if (status.cancelled) {
      await clearPendingFlow();
      await clearAlarm();
      broadcast({ phase: 'idle', code: null, error: 'Autorização cancelada.' });
      return 0;
    }
    if (status.expired) {
      await clearPendingFlow();
      await clearAlarm();
      broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
      return 0;
    }
  } catch {
    // Falha de rede transitória: mantém o alarme (backoff no próximo tick).
  }
  return POLL_INTERVAL_MS;
}

/** Agenda o alarme de polling com intervalo crescente (backoff), sem duplicar. */
async function scheduleAlarm(interval: number): void {
  await clearAlarm();
  await savePollInterval(interval);
  await browser.alarms.create(ALARM_NAME, { periodInMinutes: interval / 60_000 });
}

async function clearAlarm(): Promise<void> {
  try {
    await browser.alarms.clear(ALARM_NAME);
  } catch {
    /* ignore */
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
    const cancelSecret = generateState(); // segredo aleatório para cancelamento
    const cancelSecretHash = await sha256Hex(cancelSecret);
    const origin = getApiBase();
    const browserName = browser.runtime.getURL('').includes('moz-extension') ? 'Firefox' : 'Chrome';

    const { code } = await startAuth({
      codeChallenge,
      deviceId,
      origin,
      stateHash,
      nonceHash,
      cancelSecretHash,
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
      cancelSecret,
      origin,
      browser: browserName,
      extensionVersion,
      extensionName: 'Mants Brand Orchestrator',
      createdAt: Date.now(),
    };

    // Persiste ANTES de abrir a aba (sobrevive à suspensão do SW + reinício).
    await savePendingFlow(flow);
    broadcast({ phase: 'awaiting_user', code, error: null });

    await browser.tabs.create({
      url: `${origin}/extension/authorize?code=${encodeURIComponent(code)}`,
    });

    // Inicia o polling durável via alarme.
    await scheduleAlarm(POLL_INTERVAL_MS);
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
  // Envia code + cancelSecret ao backend (cancelamento sem cookie/Bearer).
  const payload: CancelAuthPayload = { code: flow.code, cancelSecret: flow.cancelSecret };
  try {
    await cancelAuth(payload);
  } catch (e) {
    // NÃO engole silenciosamente: reporta falha ao popup (que só mostra
    // cancelamento confirmado quando o backend confirmar).
    const msg = e instanceof Error ? e.message : 'Falha ao cancelar no servidor.';
    broadcast({ phase: 'error', code: flow.code, error: msg });
    return { ok: false };
  }
  await clearPendingFlow();
  await clearAlarm();
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
  await clearAlarm();
  broadcast(idleStatus());
  void browser.runtime.sendMessage({ type: 'SESSION_CHANGED', session: null }).catch(() => undefined);
  return { ok: true };
}

/** Recupera fluxo pendente após o SW ser suspenso/reiniciado (via alarme). */
async function recoverPendingFlow(): Promise<void> {
  const flow = await getPendingFlow();
  if (!flow) return;
  if (isExpired(flow)) {
    await clearPendingFlow();
    await clearAlarm();
    broadcast({ phase: 'expired', code: null, error: 'Código expirado.' });
    return;
  }
  broadcast({ phase: 'awaiting_user', code: flow.code, error: null });
  await scheduleAlarm(POLL_INTERVAL_MS);
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

/** Handler de mensagens: retorna PROMISE (padrão compatível Chrome/Firefox). */
function handleMessage(msg: ExtensionMessage): Promise<unknown> | void {
  switch (msg.type) {
    case 'START_AUTH':
      return startFlow();
    case 'GET_AUTH_STATUS':
      return getAuthStatus().then((status) => ({ status }) as GetAuthStatusResult);
    case 'GET_SESSION':
      return getSession().then((session) => ({ session }) as GetSessionResult);
    case 'CANCEL_FLOW':
      return cancelFlow();
    case 'LOGOUT':
      return logout();
    case 'INSERT_TEXT':
      return insertIntoChatGpt(msg.text);
    case 'OPEN_CHATGPT':
      return browser.tabs.create({ url: 'https://chatgpt.com/' }).then(() => undefined);
    default:
      return undefined;
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.log('[Mants] extensão instalada.');
  });

  // Mensagens: listener retorna Promise (sem sendResponse/sendResponse misto).
  browser.runtime.onMessage.addListener((msg: ExtensionMessage) => {
    return handleMessage(msg);
  });

  // Alarme de polling durável (sobrevive à suspensão do SW MV3).
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    void (async () => {
      const flow = await getPendingFlow();
      if (!flow) {
        await clearAlarm();
        return;
      }
      const prev = await getPollInterval();
      const next = await pollAndAdvance(flow);
      if (next > 0) {
        // Backoff progressivo persistido (sobrevive à suspensão do SW).
        const nextInterval = Math.min(prev + POLL_BACKOFF_STEP, POLL_MAX_INTERVAL_MS);
        await scheduleAlarm(nextInterval);
      }
    })();
  });

  // Ao iniciar (recuperação de SW suspenso/reiniciado + após reinício do navegador).
  void recoverPendingFlow();
});
