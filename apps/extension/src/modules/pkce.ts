/**
 * Geração criptograficamente segura dos parâmetros do fluxo PKCE + state/nonce.
 * Usa Web Crypto API e crypto.getRandomValues — nunca Math.random().
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

/** Gera um verifier PKCE (43–128 chars base64url, 32 bytes de entropia). */
export function generateCodeVerifier(): string {
  return toBase64Url(randomBytes(32));
}

/** S256: BASE64URL(SHA-256(verifier)). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

/** Estado anti-CSRF (32 bytes). */
export function generateState(): string {
  return toBase64Url(randomBytes(32));
}

/** Nonce de segurança (32 bytes). */
export function generateNonce(): string {
  return toBase64Url(randomBytes(32));
}

/** SHA-256 hexadecimal de um valor (para stateHash/nonceHash). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}
