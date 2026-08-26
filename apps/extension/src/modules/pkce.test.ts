import { describe, it, expect } from 'vitest';
import { generatePkceSecrets, createPkceChallenge } from './pkce';

// Web Crypto (globalThis.crypto) e btoa existem no Node 20+.

describe('PKCE generation (Web Crypto)', () => {
  it('gera codeVerifier com formato base64url válido', async () => {
    const s = await generatePkceSecrets();
    expect(s.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> ~43 chars base64url
    expect(s.codeVerifier.length).toBeGreaterThanOrEqual(40);
  });

  it('gera challenge S256 = base64url(SHA-256(verifier))', async () => {
    const s = await generatePkceSecrets();
    const expected = await createPkceChallenge(s.codeVerifier);
    expect(s.codeChallenge).toBe(expected);
    // challenge é base64url de um hash SHA-256 (44 chars sem padding)
    expect(s.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('state e nonce têm formato base64url', async () => {
    const s = await generatePkceSecrets();
    expect(s.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(s.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('stateHash e nonceHash são SHA-256 hex de 64 chars', async () => {
    const s = await generatePkceSecrets();
    expect(s.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(s.nonceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stateHash == sha256(state) e nonceHash == sha256(nonce)', async () => {
    const { sha256Hex } = await import('@mants/auth');
    const s = await generatePkceSecrets();
    expect(s.stateHash).toBe(sha256Hex(s.state));
    expect(s.nonceHash).toBe(sha256Hex(s.nonce));
  });

  it('gera segredos distintos a cada chamada', async () => {
    const a = await generatePkceSecrets();
    const b = await generatePkceSecrets();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('createPkceChallenge é determinístico para o mesmo verifier', async () => {
    const v = (await generatePkceSecrets()).codeVerifier;
    expect(await createPkceChallenge(v)).toBe(await createPkceChallenge(v));
  });
});
