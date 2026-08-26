/** Protocolo de mensagens entre popup/sidepanel <-> background service worker. */

export type StartAuthRequest = {
  type: 'START_AUTH';
  browser: string;
  extensionVersion: string;
  extensionName: string;
};

export type GetAuthStatusRequest = { type: 'GET_AUTH_STATUS' };

export type CancelFlowRequest = { type: 'CANCEL_FLOW' };

export type LogoutRequest = { type: 'LOGOUT' };

export type InsertTextRequest = { type: 'INSERT_TEXT'; text: string };

export type OpenChatGptRequest = { type: 'OPEN_CHATGPT' };

export type BackgroundRequest =
  | StartAuthRequest
  | GetAuthStatusRequest
  | CancelFlowRequest
  | LogoutRequest
  | InsertTextRequest
  | OpenChatGptRequest;

export type BackgroundResponse =
  | { type: 'AUTH_STARTED'; code: string }
  | { type: 'AUTH_START_FAILED'; error: string }
  | { type: 'AUTH_STATUS'; status: AuthStatus }
  | { type: 'FLOW_CANCELLED' }
  | { type: 'LOGOUT_DONE' }
  | { type: 'INSERT_RESULT'; ok: boolean; reason?: string }
  | { type: 'OPENED_CHATGPT' };

/** Estados observáveis pelo popup/sidepanel. */
export type AuthStatus =
  | { phase: 'idle' }
  | { phase: 'pending'; code: string; deviceId: string; startedAt: number; expiresAt: number }
  | { phase: 'awaiting_authorization'; code: string; deviceId: string; expiresAt: number }
  | { phase: 'authenticated'; session: ExtensionSession }
  | { phase: 'expired' }
  | { phase: 'error'; message: string };

export interface ExtensionSession {
  token: string;
  userId: string;
  organizationId: string;
  roles: string[];
  expiresIn: number;
  expiresAt: number;
}

/** Formato do fluxo PKCE persistido temporariamente no storage.local. */
export interface PendingFlow {
  code: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  stateHash: string;
  nonce: string;
  nonceHash: string;
  deviceId: string;
  origin: string;
  browser: string;
  extensionVersion: string;
  extensionName: string;
  startedAt: number;
  expiresAt: number;
  /** tentativas de exchange já realizadas (para backoff). */
  attempts: number;
  /** timestamp do último poll. */
  lastPoll: number;
}
