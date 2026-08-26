import { describe, it, expect } from 'vitest';
import { constantTimeHashEqual } from '../crypto';
import { sha256Hex } from '@mants/auth';

describe('constantTimeHashEqual', () => {
  it('compara hashes iguais em tempo constante', () => {
    const secret = 'cancel-secret-value';
    const hash = sha256Hex(secret);
    expect(constantTimeHashEqual(hash, sha256Hex(secret))).toBe(true);
  });

  it('rejeita segredo errado', () => {
    const hash = sha256Hex('correct');
    expect(constantTimeHashEqual(hash, sha256Hex('wrong'))).toBe(false);
  });

  it('rejeita hash armazenado nulo/undefined', () => {
    expect(constantTimeHashEqual(null, sha256Hex('x'))).toBe(false);
    expect(constantTimeHashEqual(undefined, sha256Hex('x'))).toBe(false);
  });

  it('rejeita comprimento divergente', () => {
    expect(constantTimeHashEqual('abc', 'def')).toBe(false);
  });
});
