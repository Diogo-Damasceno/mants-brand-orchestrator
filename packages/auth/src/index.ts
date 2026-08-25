import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Role } from '@mants/shared-types';

export interface SessionClaims {
  sub: string; // user id
  org: string; // active organization id
  roles: Role[];
  deviceId?: string;
  ext?: boolean; // true para sessão de extensão
  iat: number;
  exp: number;
  jti: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64url(input: Buffer | string): string {
  return b64url(input);
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Cria um token de sessão HMAC-SHA256 (formato JWT compatível, mas assinado pela Mants). */
export function signSession(claims: Omit<SessionClaims, 'iat' | 'exp' | 'jti'>, secret: string, ttlSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload: SessionClaims = { ...claims, iat, exp, jti: randomBytes(12).toString('hex') };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${sig}`;
}

export function verifySession(token: string, secret: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(p).toString('utf8')) as SessionClaims;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Armazena senha com scrypt (nativo do Node), salt único por registro.
 * Formato: scrypt$N$r$p$saltHex$hashHex
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$64$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'scrypt') return false;
  const salt = parts[3];
  const expectedHex = parts[4];
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const derived = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// ----- PKCE (extensão troca código por sessão) -----
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export function generatePkce(): PkcePair {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}
