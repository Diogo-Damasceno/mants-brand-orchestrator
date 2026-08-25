import { describe, it, expect } from 'vitest';
import { scoreAssets, type SelectionContext } from '@mants/asset-selection';
import type { SelectedAsset } from '@mants/shared-types';

const base: SelectionContext = {
  desiredTags: ['cafe', 'verao'],
  productIds: ['p1'],
  campaignId: 'c1',
  orientation: 'square',
  desiredColorHex: '#6F4E37',
  compatibleMimeTypes: ['image/png'],
  maxBytes: 100000,
};

const mk = (over: Partial<SelectedAsset>): SelectedAsset => ({
  id: 'x',
  originalName: 'asset.bin',
  tags: [],
  productIds: [],
  campaignIds: [],
  orientation: 'square',
  mimeType: 'image/png',
  sizeBytes: 1000,
  status: 'approved',
  priority: 0,
  commercialRightsConfirmed: true,
  archived: false,
  ...over,
});

describe('asset-selection', () => {
  it('recomenda ativo aprovado e com tag correspondente', () => {
    const r = scoreAssets(
      [mk({ id: 'a1', tags: ['cafe'], productIds: ['p1'], campaignIds: ['c1'], predominantColorHex: '#6F4E37', priority: 1 })],
      base,
    );
    expect(r[0]?.asset.id).toBe('a1');
    expect(r[0]?.score).toBeGreaterThan(0);
    expect(r[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('exclui ativo expirado', () => {
    const r = scoreAssets([mk({ id: 'a2', expiresAt: '2000-01-01T00:00:00.000Z' })], base);
    expect(r.find((x) => x.asset.id === 'a2')?.excluded).toBe(true);
  });

  it('exclui ativo sem direito comercial', () => {
    const r = scoreAssets([mk({ id: 'a3', commercialRightsConfirmed: false })], base);
    expect(r.find((x) => x.asset.id === 'a3')?.excluded).toBe(true);
  });

  it('exclui ativo arquivado', () => {
    const r = scoreAssets([mk({ id: 'a4', archived: true })], base);
    expect(r.find((x) => x.asset.id === 'a4')?.excluded).toBe(true);
  });

  it('penaliza formato incompatível', () => {
    const r = scoreAssets([mk({ id: 'a5', mimeType: 'image/webp' })], base);
    const rec = r.find((x) => x.asset.id === 'a5');
    expect(rec).toBeDefined();
    expect(rec!.reasons.some((z) => z.includes('Formato incompatível'))).toBe(true);
  });
});
