import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testa validateExtensionSession (validação REAL no backend via
 * GET /api/extension/session). Substitui a antiga getSessionSafe().
 *
 * Cobre: sessão válida, expirada, revogada, organização inexistente,
 * membership removida, token inválido e API indisponível (networkError).
 */

vi.stubGlobal('__API_BASE__', 'https://api.mants.company');

const { validateExtensionSession } = await import('../extension-client');

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal('__API_BASE__', 'https://api.mants.company');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateExtensionSession', () => {
  it('sessão válida', async () => {
    mockFetch({ valid: true, userId: 'u1', organizationId: 'o1', roles: ['brand_manager'], status: 'active', expiresAt: Date.now() + 1000 });
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(true);
    expect(v.organizationId).toBe('o1');
    expect(v.networkError).toBe(false);
  });

  it('sessão expirada (401)', async () => {
    mockFetch({ valid: false, reason: 'Sessão inválida ou expirada.' }, 401);
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
    expect(v.networkError).toBe(false);
  });

  it('sessão revogada (401)', async () => {
    mockFetch({ valid: false, reason: 'Sessão de extensão revogada ou inexistente.' }, 401);
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
  });

  it('organização inexistente (401)', async () => {
    mockFetch({ valid: false, reason: 'Organização inexistente.' }, 401);
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
  });

  it('membership removida (401)', async () => {
    mockFetch({ valid: false, reason: 'Usuário não pertence mais à organização.' }, 401);
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
  });

  it('token inválido (401)', async () => {
    mockFetch({ valid: false, reason: 'Não autenticado.' }, 401);
    const v = await validateExtensionSession('');
    expect(v.valid).toBe(false);
  });

  it('API indisponível (networkError, NÃO sessão inválida)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
    expect(v.networkError).toBe(true);
  });

  it('5xx diferenciado de sessão inválida', async () => {
    mockFetch({ valid: false, reason: 'Erro interno.' }, 500);
    const v = await validateExtensionSession('tok');
    expect(v.valid).toBe(false);
    expect(v.networkError).toBe(true);
  });
});
