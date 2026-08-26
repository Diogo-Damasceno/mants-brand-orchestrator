import { timingSafeEqual } from 'node:crypto';

/**
 * Comparação em tempo constante entre dois hashes hexadecimais (SHA-256, 64 chars).
 * Usado para validar cancelSecretHash e outros segredos sem vazamento de tempo.
 */
export function constantTimeHashEqual(storedHash: string | null | undefined, computedHash: string): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(storedHash);
  const b = Buffer.from(computedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Calcula SHA-256 hexadecimal (re-export para centralizar). */
export { sha256Hex as sha256HexString } from '@mants/auth';
