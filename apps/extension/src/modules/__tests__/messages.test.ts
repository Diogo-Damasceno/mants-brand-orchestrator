import { describe, it, expect } from 'vitest';
import type {
  AuthPhase,
  PendingFlow,
  ExtensionMessage,
  CancelAuthPayload,
} from '../messages';

/** Testes do protocolo de mensagens (popup/sidepanel <-> background/content). */
describe('protocolo de mensagens', () => {
  it('PendingFlow exige campos obrigatórios', () => {
    const flow: PendingFlow = {
      code: 'c',
      codeVerifier: 'v',
      state: 's',
      nonce: 'n',
      deviceId: 'd',
      cancelSecret: 'cs',
      origin: 'https://api.mants.company',
      browser: 'Chrome',
      extensionVersion: '0.1.0',
      extensionName: 'Mants Brand Orchestrator',
      createdAt: 1,
    };
    expect(flow.code).toBe('c');
    expect(flow.createdAt).toBe(1);
  });

  it('AuthPhase inclui estados do fluxo', () => {
    const phases: AuthPhase[] = [
      'idle',
      'authorizing',
      'awaiting_user',
      'exchanging',
      'authenticated',
      'expired',
      'error',
    ];
    expect(phases.length).toBe(7);
  });

  it('CancelAuthPayload carrega code + cancelSecret', () => {
    const payload: CancelAuthPayload = { code: 'c', cancelSecret: 's' };
    expect(payload.code).toBe('c');
  });

  it('ExtensionMessage distingue tipos de broadcast', () => {
    const msgs: ExtensionMessage[] = [
      { type: 'START_AUTH' },
      { type: 'AUTH_STATE_CHANGED', status: { phase: 'authenticated', code: null, error: null } },
      { type: 'SESSION_CHANGED', session: null },
    ];
    expect(msgs.map((m) => m.type)).toEqual(['START_AUTH', 'AUTH_STATE_CHANGED', 'SESSION_CHANGED']);
  });
});
