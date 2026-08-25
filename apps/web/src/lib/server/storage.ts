import { getServerConfig } from '@mants/config';
import { createHash } from 'node:crypto';

export interface StorageObject {
  key: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * Abstração de storage compatível com S3. Em dev usamos disco local (ou MinIO).
 * Em produção: R2/S3 com URLs assinadas e bucket privado.
 * Implementação local para desenvolvimento/testes (não usa dependência externa).
 */
export interface StorageProvider {
  put(obj: StorageObject): Promise<{ key: string; size: number }>;
  getSignedUrl(key: string, expiresSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT ?? '/tmp/mants-storage';

class LocalStorageProvider implements StorageProvider {
  async put(obj: StorageObject): Promise<{ key: string; size: number }> {
    const fs = await import('node:fs/promises');
    const path = `${LOCAL_ROOT}/${obj.key}`;
    await fs.mkdir(path.substring(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, obj.buffer);
    return { key: obj.key, size: obj.buffer.byteLength };
  }
  async getSignedUrl(key: string): Promise<string> {
    // Em dev, URL local direta (bucket privado seria assinada em produção).
    return `/api/storage/file?key=${encodeURIComponent(key)}`;
  }
  async delete(key: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.rm(`${LOCAL_ROOT}/${key}`, { force: true });
  }
}

export function createStorage(): StorageProvider {
  const cfg = getServerConfig();
  if (cfg.storageProvider === 'local' || cfg.nodeEnv !== 'production') {
    return new LocalStorageProvider();
  }
  // Produção: usar cliente S3/R2 real. Preparação (não ativo no MVP).
  return new LocalStorageProvider();
}

export function sha256Hex(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Valida MIME contra lista permitida e limite de tamanho configurável. */
export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'font/woff2',
  'font/ttf',
  'application/octet-stream', // TTF/OTF validados por extensão
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB configurável

export function validateUpload(mime: string, size: number): void {
  if (!ALLOWED_MIME.has(mime)) throw new Error('Tipo de arquivo não permitido.');
  if (size > MAX_UPLOAD_BYTES) throw new Error('Arquivo excede o limite de tamanho.');
}

/** Sanitiza SVG (remove scripts) — validação mínima sem IA. */
export function sanitizeSvg(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '');
}
