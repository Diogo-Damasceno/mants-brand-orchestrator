/**
 * Protocolo de mensagens entre popup, side panel, background e content script.
 * Tipagem centralizada para evitar erros silenciosos de mensagem.
 *
 * Fluxo de autorização (duradouro no background):
 *   POPUP  -> START_AUTH            -> BACKGROUND
 *   POPUP  -> GET_AUTH_STATUS        -> BACKGROUND (resposta síncrona)
 *   BACKGROUND -> AUTH_STATE_CHANGED  -> popup/sidepanel (broadcast)
 *   BACKGROUND -> INSERT_TEXT          -> content (chatgpt.com)
 */

export type AuthPhase =
  | 'idle'
  | 'authorizing' // background iniciou e abriu a aba
  | 'awaiting_user' // usuário deve autorizar no site
  | 'exchanging' // background concluindo exchange
  | 'authenticated'
  | 'expired'
  | 'error';

export interface AuthStatus {
  phase: AuthPhase;
  code: string | null;
  error: string | null;
}

export interface PendingFlow {
  code: string;
  codeVerifier: string;
  state: string;
  nonce: string;
  deviceId: string;
  origin: string;
  browser: string;
  extensionVersion: string;
  extensionName: string;
  createdAt: number;
}

export type ExtensionMessage =
  // popup/sidepanel -> background
  | { type: 'START_AUTH' }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'CANCEL_FLOW' }
  | { type: 'LOGOUT' }
  | { type: 'INSERT_TEXT'; text: string }
  | { type: 'OPEN_CHATGPT' }
  | { type: 'GET_SESSION' }
  // background -> popup/sidepanel (broadcast)
  | { type: 'AUTH_STATE_CHANGED'; status: AuthStatus }
  | { type: 'SESSION_CHANGED'; session: unknown | null }
  // content -> background
  | { type: 'CONTENT_READY' };

export interface StartAuthResult {
  ok: boolean;
  error?: string;
}

export interface GetAuthStatusResult {
  status: AuthStatus;
}

export interface GetSessionResult {
  session: unknown | null;
}

export interface InsertTextResult {
  ok: boolean;
  reason?: string;
}

export interface LogoutResult {
  ok: boolean;
}

export interface CancelFlowResult {
  ok: boolean;
}
