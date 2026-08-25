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

/** Cria um token de sessão HMAC-SHA256 (formato JWT compatível, assinado pela Mants). */
export function signSession(
  claims: Omit<SessionClaims, 'iat' | 'exp' | 'jti'>,
  secret: string,
  ttlSeconds: number,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload: SessionClaims = { ...claims, iat, exp, jti: randomBytes(12).toString('hex') };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${sig}`;
}

export function verifySession(token: string, secret: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac('sha256', secret)
    .update(`${h}.${p}`)
    .digest('base64')
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

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function parseParams(token: string): { N: number; r: number; p: number; salt: Buffer; hash: Buffer; legacy: boolean } | null {
  // scrypt$v=1$N=16384$r=8$p=1$salt=<b64url>$hash=<b64url>
  const m = token.match(/^scrypt\$v=1\$N=(\d+)\$r=(\d+)\$p=(\d+)\$salt=([^$]+)\$hash=(.+)$/);
  if (!m) {
    // Formato legado: scrypt$<keylen>$1$<saltHex>$<hashHex>
    const parts = token.split('$');
    if (parts.length === 5 && parts[0] === 'scrypt') {
      return {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: Buffer.from(parts[3]!, 'hex'),
        hash: Buffer.from(parts[4]!, 'hex'),
        legacy: true,
      };
    }
    return null;
  }
  return {
    N: Number(m[1]),
    r: Number(m[2]),
    p: Number(m[3]),
    salt: Buffer.from(m[4]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    hash: Buffer.from(m[5]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    legacy: false,
  };
}

/**
 * Armazena senha com scrypt (nativo do Node), salt único por registro.
 * Formato versionado: scrypt$v=1$N=...$r=...$p=...$salt=<b64url>$hash=<b64url>
 */
export function hashPassword(password: string): string {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error('Senha fora dos limites de tamanho.');
  }
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$v=1$N=${SCRYPT_N}$r=${SCRYPT_R}$p=${SCRYPT_P}$salt=${salt.toString('base64url')}$hash=${derived.toString('base64url')}`;
}

/** Verifica senha contra hash armazenado (suporta formato legado). */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseParams(stored);
  if (!parsed) return false;
  const derived = scryptSync(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
  });
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/** Indica se o hash deve ser regerado (formato legado ou parâmetros atuais diferentes dos vigentes). */
export function needsRehash(stored: string): boolean {
  const parsed = parseParams(stored);
  if (!parsed) return true;
  if (parsed.legacy) return true;
  return parsed.N !== SCRYPT_N || parsed.r !== SCRYPT_R || parsed.p !== SCRYPT_P;
}

// ----- PKCE (extensão troca código por sessão) -----
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/** Gera par verifier/challenge PKCE S256. */
export function generatePkce(): PkcePair {
  const codeVerifier = randomBytes(32).toString('base64url');
  return { codeVerifier, codeChallenge: createPkceChallenge(codeVerifier) };
}

/** BASE64URL(SHA256(code_verifier)) diretamente sobre os bytes do SHA-256. */
export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(Buffer.from(verifier, 'utf8')).digest('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}
