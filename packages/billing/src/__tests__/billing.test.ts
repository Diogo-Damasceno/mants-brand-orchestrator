import { describe, it, expect } from 'vitest';
import { getPlan, enforcePlanLimits, PLANS } from '@mants/billing';
import { sha256Hex } from '@mants/auth';
import { hashPassword, verifyPassword, signSession, verifySession, generatePkce } from '@mants/auth';

describe('billing', () => {
  it('planos Básico/Profissional/Agência existem', () => {
    const tiers = PLANS.map((p) => p.tier);
    expect(tiers).toContain('basic');
    expect(tiers).toContain('professional');
    expect(tiers).toContain('agency');
  });

  it('limites do plano Básico bloqueiam múltiplos brand kits', () => {
    const basic = getPlan('basic');
    expect(() => enforcePlanLimits(basic, { brandKits: 2, users: 1, clients: 1, storageBytes: 1, packagesThisMonth: 1, retentionDays: 30 })).toThrow();
  });

  it('limites do plano Profissional permitem múltiplos brand kits', () => {
    const pro = getPlan('professional');
    expect(() => enforcePlanLimits(pro, { brandKits: 5, users: 5, clients: 5, storageBytes: 1, packagesThisMonth: 10, retentionDays: 90 })).not.toThrow();
  });
});

describe('auth', () => {
  it('hashPassword e verifyPassword funcionam', async () => {
    const hash = await hashPassword('senha-segura-123');
    expect(hash).not.toBe('senha-segura-123');
    expect(await verifyPassword('senha-segura-123', hash)).toBe(true);
    expect(await verifyPassword('errada', hash)).toBe(false);
  });

  it('sessão JWT round-trip', () => {
    const secret = 'test-secret';
    const token = signSession({ sub: 'user-1', org: 'org-1', roles: ['organization_owner'], deviceId: 'dev-1' }, secret, 3600);
    const claims = verifySession(token, secret);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('user-1');
    expect(claims!.org).toBe('org-1');
  });

  it('sessão expirada retorna null', () => {
    const secret = 'test-secret';
    const token = signSession({ sub: 'u', org: 'o', roles: [] }, secret, -10);
    expect(verifySession(token, secret)).toBeNull();
  });

  it('PKCE gera verifier e challenge (base64url)', () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    expect(codeVerifier.length).toBeGreaterThan(20);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sha256Hex('')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hash', () => {
  it('sha256Hex estável e de 64 chars', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toMatch(/^[a-f0-9]{64}$/);
  });
});
