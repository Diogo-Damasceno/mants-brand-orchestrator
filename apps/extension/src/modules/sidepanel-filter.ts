import type { Option } from './sidepanel-types';

/**
 * Isolamento por cliente no side panel.
 *
 * Filtra os Brand Kits pela resposta real de /api/brand-kits (que inclui
 * `clientId`). Recebe o clientId EXPLÍCITO para não depender do estado React
 * assíncrono (que causava mostrar Brand Kits do cliente anterior).
 */
export function filterBrandKitsByClient(brandKits: Option[], clientId: string | undefined | null): Option[] {
  if (!clientId) return brandKits;
  return brandKits.filter((b) => b.clientId === clientId);
}
