/**
 * Cliente central de comunicação popup/sidepanel <-> background.
 * Centraliza tratamento de 401 (sessão expirada) para limpar e solicitar login.
 */
import type { ExtensionMessage, AuthStatus } from './messages';
import { clearSession } from './storage';
import { getApiBase } from './api';

function send<T = unknown>(msg: ExtensionMessage): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}

export interface ApiTokenOptions {
  token: string;
}

export async function extGet<T>(path: string, token: string): Promise<T> {
  return fetchWithAuth<T>('GET', path, token);
}

export async function extPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  return fetchWithAuth<T>('POST', path, token, body);
}

export async function extPatch<T>(path: string, token: string, body?: unknown): Promise<T> {
  return fetchWithAuth<T>('PATCH', path, token, body);
}

async function fetchWithAuth<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Sessão expirada (centralizado): limpa e avisa popup/side panel.
    await clearSession();
    await browser.runtime.sendMessage({ type: 'SESSION_CHANGED', session: null }).catch(() => undefined);
    await browser.runtime
      .sendMessage({ type: 'AUTH_STATE_CHANGED', status: { phase: 'expired', code: null, error: 'Sessão expirada.' } })
      .catch(() => undefined);
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

/** Busca configuração pública (rota sem autenticação). Não envia token. */
export async function getPublicConfig<T = unknown>(): Promise<T> {
  const res = await fetch(`${getApiBase()}/api/extension/config`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const r = await send<{ status: AuthStatus }>({ type: 'GET_AUTH_STATUS' });
  return r.status;
}

export async function startAuthFlow(): Promise<{ ok: boolean; error?: string }> {
  return send<{ ok: boolean; error?: string }>({ type: 'START_AUTH' });
}

export async function cancelFlow(): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>({ type: 'CANCEL_FLOW' });
}

export async function logout(): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>({ type: 'LOGOUT' });
}

export async function getSessionSafe<T = unknown>(): Promise<T | null> {
  const r = await send<{ session: T | null }>({ type: 'GET_SESSION' });
  return r.session;
}

/** Resultado estruturado da validação de sessão no backend. */
export interface ExtensionSessionValidation {
  valid: boolean;
  reason?: string;
  userId?: string;
  organizationId?: string;
  roles?: string[];
  status?: string;
  expiresAt?: number;
  /** true quando a falha foi de rede/indisponibilidade, NÃO de sessão inválida. */
  networkError?: boolean;
}

/**
 * Valida a sessão da extensão contra o backend REAL (GET /api/extension/session).
 *
 * Substitui a antiga `getSessionSafe()`, que apenas devolvia a sessão local sem
 * qualquer verificação. Aqui conferimos assinatura, expiração, revogação,
 * usuário, organização e membership no servidor.
 *
 * Importante: erro de rede (fetch falha / 5xx) NÃO significa sessão inválida.
 * O chamador deve distinguir `networkError` de sessão inválida — não apague uma
 * sessão válida só porque o usuário ficou offline.
 */
export async function validateExtensionSession(token: string): Promise<ExtensionSessionValidation> {
  try {
    const res = await fetch(`${getApiBase()}/api/extension/session`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean; reason?: string };
      return {
        valid: false,
        reason: data.reason ?? `Validação falhou (HTTP ${res.status}).`,
        networkError: res.status >= 500,
      };
    }
    const data = (await res.json()) as ExtensionSessionValidation;
    return {
      valid: Boolean(data.valid),
      reason: data.reason,
      userId: data.userId,
      organizationId: data.organizationId,
      roles: data.roles,
      status: data.status,
      expiresAt: data.expiresAt,
      networkError: false,
    };
  } catch {
    // Falha de rede/indisponibilidade: NÃO considerar sessão inválida.
    return { valid: false, reason: 'API indisponível.', networkError: true };
  }
}
