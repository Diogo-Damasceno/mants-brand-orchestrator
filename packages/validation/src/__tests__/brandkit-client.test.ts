import { describe, it, expect } from 'vitest';
import { brandKitCreateSchema } from '@mants/validation';

describe('brandKitCreateSchema', () => {
  const base = {
    name: 'BK Teste',
    recommendedWords: [],
    prohibitedWords: [],
    brandExpressions: [],
    colors: [],
    fonts: [],
    approvedLogos: [],
    logoVariations: [],
    icons: [],
    graphicElements: [],
    approvedPhotos: [],
    references: [],
    approvedExamples: [],
    rejectedExamples: [],
    approvedCtas: [],
  };

  it('aceita clientId válido (uuid)', () => {
    const r = brandKitCreateSchema.parse({ ...base, clientId: '11111111-1111-1111-1111-111111111111' });
    expect(r.clientId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('permite clientId nulo/ausente (Brand Kits legados)', () => {
    expect(brandKitCreateSchema.parse(base).clientId).toBeUndefined();
    expect(brandKitCreateSchema.parse({ ...base, clientId: null }).clientId).toBeNull();
  });

  it('rejeita clientId não-uuid', () => {
    expect(() => brandKitCreateSchema.parse({ ...base, clientId: 'not-a-uuid' })).toThrow();
  });
});
