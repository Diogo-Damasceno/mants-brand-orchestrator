import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  signSession,
  verifySession,
  createPkceChallenge,
  generatePkce,
  hashSessionToken,
  sha256Hex,
} from '../index';

const SECRET = 'test-secret';

describe('scrypt password hashing', () => {
  it('produces a versioned format with explicit parameters', () => {
    const h = hashPassword('senha-segura-123');
    expect(h.startsWith('scrypt$v=1$N=16384$r=8$p=1$salt=')).toBe(true);
    expect(h).toContain('$hash=');
  });

  it('verifies a correct password and rejects a wrong one', () => {
    const h = hashPassword('senha-segura-123');
    expect(verifyPassword('senha-segura-123', h)).toBe(true);
    expect(verifyPassword('errada', h)).toBe(false);
  });

  it('uses a unique salt per hash', () => {
    const a = hashPassword('senha-valida-1');
    const b = hashPassword('senha-valida-1');
    expect(a).not.toBe(b);
  });

  it('needsRehash is false for current params and true for legacy format', () => {
    const current = hashPassword('senha-valida-1');
    expect(needsRehash(current)).toBe(false);
    const legacy = 'scrypt$64$1$0102030405060708090a0b0c0d0e0f10$abcdef';
    expect(needsRehash(legacy)).toBe(true);
  });

  it('rejects malformed hashes', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(needsRehash('not-a-hash')).toBe(true);
  });

  it('rejects passwords outside size limits at hash time', () => {
    expect(() => hashPassword('curta')).toThrow();
  });
});

describe('session token hash', () => {
  it('hashSessionToken é determinístico e diferente de createPkceChallenge', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.payload.sig';
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toBe(sha256Hex(token));
    // A mesma função canônica deve ser usada em criação e autenticação.
    expect(hashSessionToken(token)).not.toBe(createPkceChallenge(token));
  });

  it('tokens diferentes produzem hashes diferentes', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});

describe('pkce', () => {
  it('createPkceChallenge computes BASE64URL(SHA256(verifier))', async () => {
    const { createHash } = await import('node:crypto');
    const verifier = 'a'.repeat(43);
    const expected = createHash('sha256').update(Buffer.from(verifier, 'utf8')).digest('base64url');
    expect(createPkceChallenge(verifier)).toBe(expected);
  });

  it('generatePkce produces a challenge matching its verifier', () => {
    const pair = generatePkce();
    expect(createPkceChallenge(pair.codeVerifier)).toBe(pair.codeChallenge);
  });
});

describe('session tokens', () => {
  it('round-trips claims and rejects tampered tokens', () => {
    const token = signSession({ sub: 'u1', org: 'o1', roles: ['organization_owner'] }, SECRET, 3600);
    const claims = verifySession(token, SECRET);
    expect(claims?.sub).toBe('u1');
    expect(verifySession(token + 'x', SECRET)).toBeNull();
    expect(verifySession(token, 'wrong')).toBeNull();
  });
});
