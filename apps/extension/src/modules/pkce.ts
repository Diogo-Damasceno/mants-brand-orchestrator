/**
 * Geração de segredos PKCE/state/nonce usando Web Crypto (nunca Math.random).
 * Tudo roda no contexto da extensão (popup/background). Os hashes SHA-256 de
 * state/nonce são enviados ao backend; os valores em RAW ficam apenas no
 * dispositivo até o exchange e são apagados em seguida.
 */

function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytesBase64Url(length = 32): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToBase64Url(digest);
}

export interface PkceSecrets {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  stateHash: string;
  nonce: string;
  nonceHash: string;
}

export async function generatePkceSecrets(): Promise<PkceSecrets> {
  const codeVerifier = randomBytesBase64Url(32);
  const codeChallenge = await createPkceChallenge(codeVerifier);
  const state = randomBytesBase64Url(32);
  const nonce = randomBytesBase64Url(32);
  const stateHash = await sha256Hex(state);
  const nonceHash = await sha256Hex(nonce);
  return { codeVerifier, codeChallenge, state, stateHash, nonce, nonceHash };
}

/** Gera deviceId estável (uma vez) ou retorna o existente. */
export async function getDeviceId(): Promise<string> {
  const r = await browser.storage.local.get('mants_device_id');
  if (r.mants_device_id) return r.mants_device_id as string;
  const id = (crypto.randomUUID?.() ?? randomBytesBase64Url(16)) as string;
  await browser.storage.local.set({ mants_device_id: id });
  return id;
}
