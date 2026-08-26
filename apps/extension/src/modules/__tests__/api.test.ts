import { describe, it, expect, vi } from 'vitest';

const { validateApiOrigin } = await import('../api');

describe('validateApiOrigin', () => {
  it('aceita https puro', () => {
    expect(validateApiOrigin('https://api.mants.company')).toBe('https://api.mants.company');
  });

  it('rejeita path/query/fragment', () => {
    expect(() => validateApiOrigin('https://api.mants.company/path')).toThrow();
    expect(() => validateApiOrigin('https://api.mants.company?x=1')).toThrow();
    expect(() => validateApiOrigin('https://api.mants.company/#frag')).toThrow();
  });

  it('rejeita origem inválida', () => {
    expect(() => validateApiOrigin('not-a-url')).toThrow();
  });

  it('rejeita protocolo não http(s)', () => {
    expect(() => validateApiOrigin('ftp://api.mants.company')).toThrow();
  });

  it('permite http apenas para localhost em desenvolvimento', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(validateApiOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(() => validateApiOrigin('http://evil.com')).toThrow();
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('bloqueia http (mesmo localhost) em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => validateApiOrigin('http://localhost:3000')).toThrow(/produção/);
    vi.stubEnv('NODE_ENV', 'test');
  });
});
