import { HttpError } from './http';
import { getServerConfig } from '@mants/config';

/**
 * Valida origem contra allowlist exata (não prefixo genérico como origin.startsWith('http')).
 * Lê a lista de EXTENSION_ALLOWED_API_ORIGIN (vírgula-separada) que deve conter origens exatas.
 */
export function assertAllowedOrigin(origin: string): void {
  const allowed = getServerConfig()
    .extensionAllowedApiOrigin.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) {
    throw new HttpError(403, 'Origem não autorizada.');
  }
}
