import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes de flow-state: persistência do fluxo PKCE no storage.local da extensão.
 * `browser` é mockado como global.
 */

const store: Record<string, unknown> = {};
const storageApi = {
  local: {
    get: vi.fn(async (key: string | string[]) => {
      if (Array.isArray(key)) {
        const out: Record<string, unknown> = {};
        for (const k of key) out[k] = store[k];
        return out;
      }
      return { [key]: store[key] };
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(store, obj);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) delete store[k];
    }),
  },
};

vi.stubGlobal('browser', { storage: storageApi });

const { savePendingFlow, getPendingFlow, clearPendingFlow, saveAuthStatus, getAuthStatus } =
  await import('../flow-state');

const flow = {
  code: 'abc',
  codeVerifier: 'ver',
  state: 'st',
  nonce: 'no',
  deviceId: 'dev',
  cancelSecret: 'sec',
  origin: 'https://api.mants.company',
  browser: 'Chrome',
  extensionVersion: '0.1.0',
  extensionName: 'Mants Brand Orchestrator',
  createdAt: 1_000,
};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('pending flow', () => {
  it('salva e recupera', async () => {
    await savePendingFlow(flow);
    const got = await getPendingFlow();
    expect(got).toEqual(flow);
  });
  it('retorna null quando ausente', async () => {
    expect(await getPendingFlow()).toBeNull();
  });
  it('limpa corretamente', async () => {
    await savePendingFlow(flow);
    await clearPendingFlow();
    expect(await getPendingFlow()).toBeNull();
  });
});

describe('auth status', () => {
  it('default idle', async () => {
    expect(await getAuthStatus()).toEqual({ phase: 'idle', code: null, error: null });
  });
  it('salva e recupera', async () => {
    await saveAuthStatus({ phase: 'authenticated', code: null, error: null });
    expect(await getAuthStatus()).toEqual({ phase: 'authenticated', code: null, error: null });
  });
});
