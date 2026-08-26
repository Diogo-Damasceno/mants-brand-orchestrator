import { describe, it, expect } from 'vitest';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  generateNonce,
  sha256Hex,
} from '../pkce';

const B64URL = /^[A-Za-z0-9_-]+$/;

describe('pkce', () => {
  it('gera code_verifier com formato base64url e entropia de 32 bytes', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(B64URL);
    // 32 bytes -> 43 chars base64url (sem padding)
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(44);
  });

  it('code_verifier é único a cada chamada', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it('challenge S256 = BASE64URL(SHA-256(verifier))', async () => {
    const v = generateCodeVerifier();
    const challenge = await deriveCodeChallenge(v);
    expect(challenge).toMatch(B64URL);
    // Recalcular manualmente e comparar.
    const expected = await sha256Hex(v);
    const manual = Buffer.from(expected, 'hex')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(manual);
  });

  it('estado e nonce têm 32 bytes de entropia e formato base64url', () => {
    expect(generateState()).toMatch(B64URL);
    expect(generateNonce()).toMatch(B64URL);
    expect(generateState().length).toBeGreaterThanOrEqual(43);
    expect(generateNonce().length).toBeGreaterThanOrEqual(43);
  });

  it('state e nonce são únicos', () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateNonce()).not.toBe(generateNonce());
  });

  it('sha256Hex produz 64 caracteres hex', async () => {
    const h = await sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await sha256Hex('hello'));
  });
});
