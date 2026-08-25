import type { SelectedAsset, AssetOrientation } from '@mants/shared-types';

export interface SelectionContext {
  /** Tags desejadas para a campanha (ex.: 'promo', 'cafe'). */
  desiredTags: string[];
  /** IDs de produtos associados. */
  productIds: string[];
  /** ID da campanha atual. */
  campaignId?: string;
  /** Orientação compatível com o formato (ex.: 'square' para post). */
  orientation?: AssetOrientation;
  /** Cor predominante desejada (hex) para reforço de marca. */
  desiredColorHex?: string;
  /** Formatos MIME compatíveis com o destino (ex.: imagens). */
  compatibleMimeTypes?: string[];
  /** Tamanho máximo em bytes (limite configurável). */
  maxBytes?: number;
  now?: string;
}

export interface ScoredAsset {
  asset: SelectedAsset;
  score: number;
  reasons: string[];
  excluded: boolean;
  exclusionReason?: string;
}

function normalizedHex(hex?: string): string | undefined {
  return hex?.toLowerCase();
}

function colorProximity(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizedHex(a) === normalizedHex(b);
}

function isExpired(asset: SelectedAsset, nowIso: string): boolean {
  if (!asset.expiresAt) return false;
  return new Date(asset.expiresAt).getTime() <= new Date(nowIso).getTime();
}

/**
 * Recomenda ativos por pontuação baseada em regras (sem IA).
 * Exclui por regra: expirado, sem direito comercial, arquivado, formato incompatível.
 * Retorna lista ordenada com motivos para transparência.
 */
export function scoreAssets(assets: SelectedAsset[], ctx: SelectionContext): ScoredAsset[] {
  const nowIso = ctx.now ?? new Date().toISOString();
  const results: ScoredAsset[] = [];

  for (const asset of assets) {
    const reasons: string[] = [];
    let score = 0;

    // Exclusões por regra (hard filters).
    if (isExpired(asset, nowIso)) {
      results.push({
        asset,
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: 'Ativo expirado.',
      });
      continue;
    }
    if (!asset.commercialRightsConfirmed) {
      results.push({
        asset,
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: 'Direito comercial não confirmado.',
      });
      continue;
    }
    if (asset.archived) {
      results.push({
        asset,
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: 'Ativo arquivado.',
      });
      continue;
    }
    if (asset.status === 'rejected') {
      results.push({
        asset,
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: 'Ativo rejeitado.',
      });
      continue;
    }
    if (ctx.maxBytes && (asset.sizeBytes ?? 0) > ctx.maxBytes) {
      results.push({
        asset,
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: 'Excede o limite de tamanho configurável.',
      });
      continue;
    }
    if (ctx.compatibleMimeTypes && ctx.compatibleMimeTypes.length) {
      const ok = ctx.compatibleMimeTypes.includes(asset.mimeType);
      if (!ok) {
        score -= 30;
        reasons.push('Formato incompatível com o destino (penalizado).');
      }
    }

    // Pontuação positiva.
    const tagHits = asset.tags.filter((t) => ctx.desiredTags.includes(t));
    if (tagHits.length) {
      score += 20 * tagHits.length;
      reasons.push(`Tag(s) correspondente(s): ${tagHits.join(', ')} (+${20 * tagHits.length})`);
    }
    const productHits = asset.productIds.filter((p) => ctx.productIds.includes(p));
    if (productHits.length) {
      score += 20 * productHits.length;
      reasons.push(`Produto(s) correspondente(s) (+${20 * productHits.length})`);
    }
    if (ctx.campaignId && asset.campaignIds.includes(ctx.campaignId)) {
      score += 15;
      reasons.push('Associado à campanha (+15)');
    }
    if (ctx.orientation && asset.orientation && ctx.orientation !== 'any' && asset.orientation !== 'any') {
      if (asset.orientation === ctx.orientation) {
        score += 15;
        reasons.push(`Orientação compatível (${ctx.orientation}) (+15)`);
      } else {
        score -= 10;
        reasons.push(`Orientação incompatível (${asset.orientation}) (penalizado)`);
      }
    }
    if (ctx.desiredColorHex && colorProximity(asset.predominantColorHex, ctx.desiredColorHex)) {
      score += 10;
      reasons.push('Cor predominante compatível (+10)');
    }
    if (asset.status === 'approved') {
      score += 20;
      reasons.push('Ativo aprovado (+20)');
    }
    if ((asset as { priority?: number }).priority && (asset as { priority?: number }).priority! > 0) {
      score += 10;
      reasons.push('Ativo prioritário (+10)');
    }

    if (reasons.length === 0) reasons.push('Sem correspondência específica; mantido como opção neutra.');
    results.push({ asset, score, reasons, excluded: false });
  }

  // Ordena: não excluídos primeiro, por score desc.
  results.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score;
  });
  return results;
}

/** Seleciona os N melhores ativos não excluídos. */
export function recommendAssets(
  assets: SelectedAsset[],
  ctx: SelectionContext,
  limit = 10,
): ScoredAsset[] {
  return scoreAssets(assets, ctx)
    .filter((s) => !s.excluded)
    .slice(0, limit);
}
