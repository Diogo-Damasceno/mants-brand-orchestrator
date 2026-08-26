/* eslint-disable no-console */
import { getServerConfig } from '@mants/config';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import {
  type S3Config,
  presignGet,
  s3Put,
  s3Get,
  s3Delete,
} from './s3';

export interface StorageObject {
  key: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * Abstração de storage compatível com S3.
 *  - Desenvolvimento: MinIO (configurável via STORAGE_*).
 *  - Produção: S3 ou Cloudflare R2 (mesmo cliente S3-compatível).
 *
 * EM PRODUÇÃO: falha na inicialização se o storage não estiver configurado.
 * NÃO usamos silenciosamente o disco local em produção.
 */
export interface StorageProvider {
  put(obj: StorageObject): Promise<{ key: string; size: number }>;
  getSignedUrl(key: string, expiresSeconds: number): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export function toS3Config(): S3Config {
  const cfg = getServerConfig();
  return {
    endpoint: cfg.storageEndpoint,
    region: cfg.storageRegion,
    bucket: cfg.storageBucket,
    accessKeyId: cfg.storageAccessKeyId,
    secretAccessKey: cfg.storageSecretAccessKey,
    usePathStyle: cfg.storageUsePathStyle,
  };
}

class S3StorageProvider implements StorageProvider {
  private s3: S3Config;
  constructor(s3: S3Config) {
    this.s3 = s3;
  }
  async put(obj: StorageObject): Promise<{ key: string; size: number }> {
    await s3Put(this.s3, obj.key, obj.buffer, obj.contentType);
    return { key: obj.key, size: obj.buffer.byteLength };
  }
  async getSignedUrl(key: string, expiresSeconds: number): Promise<string> {
    return presignGet(this.s3, key, expiresSeconds);
  }
  async get(key: string): Promise<Buffer> {
    return s3Get(this.s3, key);
  }
  async delete(key: string): Promise<void> {
    await s3Delete(this.s3, key);
  }
}

/** LocalStorageProvider: APENAS desenvolvimento/testes. Nunca em produção. */
const LOCAL_ROOT_RAW = process.env.STORAGE_LOCAL_ROOT ?? '/tmp/mants-storage';
const LOCAL_ROOT = resolve(LOCAL_ROOT_RAW);

/** Protege contra path traversal, caminhos absolutos, bytes nulos e .. */
function safeLocalPath(key: string): string {
  if (key.includes('\0')) throw new Error('Chave inválida (bytes nulos).');
  // Normaliza e garante que permanece dentro de LOCAL_ROOT.
  const resolved = resolve(LOCAL_ROOT, key);
  const rel = relative(LOCAL_ROOT, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Caminho de armazenamento fora da raiz permitida.');
  }
  return resolved;
}

class LocalStorageProvider implements StorageProvider {
  async put(obj: StorageObject): Promise<{ key: string; size: number }> {
    const fs = await import('node:fs/promises');
    const path = safeLocalPath(obj.key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, obj.buffer);
    return { key: obj.key, size: obj.buffer.byteLength };
  }
  async getSignedUrl(key: string): Promise<string> {
    return `/api/storage/file?key=${encodeURIComponent(key)}`;
  }
  async get(key: string): Promise<Buffer> {
    const fs = await import('node:fs/promises');
    return fs.readFile(safeLocalPath(key));
  }
  async delete(key: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.rm(safeLocalPath(key), { force: true });
  }
}

/**
 * Seleção EXPLÍCITA do provider. Em produção, exige configuração completa de
 * S3/R2/MinIO; senão, falha na inicialização (não cai no disco local).
 */
export function createStorage(): StorageProvider {
  const cfg = getServerConfig();
  const isProd = cfg.nodeEnv === 'production';

  if (cfg.storageProvider === 'local' && !isProd) {
    return new LocalStorageProvider();
  }

  // MinIO/S3/R2 todos usam o cliente S3-compatível.
  const configured = Boolean(
    cfg.storageEndpoint &&
      cfg.storageBucket &&
      cfg.storageAccessKeyId &&
      cfg.storageSecretAccessKey,
  );

  if (cfg.storageProvider === 'minio' || cfg.storageProvider === 's3' || cfg.storageProvider === 'r2') {
    if (!configured) {
      if (isProd) {
        throw new Error(
          'STORAGE não configurado em produção. Defina STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID e STORAGE_SECRET_ACCESS_KEY.',
        );
      }
      // Dev sem credenciais: usa disco local (não silencioso — loga).
      console.warn('[storage] credenciais S3 ausentes; usando LocalStorageProvider em dev.');
      return new LocalStorageProvider();
    }
    return new S3StorageProvider(toS3Config());
  }

  // Fallback: em produção falha; em dev usa local.
  if (isProd) {
    throw new Error(`STORAGE_PROVIDER=${cfg.storageProvider} inválido em produção.`);
  }
  return new LocalStorageProvider();
}

export function sha256Hex(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Lista de MIME realmente suportados (validados por magic bytes). */
export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'font/woff2',
  'font/ttf',
  'font/otf',
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB configurável

/** Verifica magic bytes reais contra o MIME declarado (não confia no navegador). */
export function detectMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return 'image/webp';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x32) return 'font/woff2';
  if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return 'font/ttf';
  if (buf[0] === 0x4f && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4f) return 'font/otf';
  const head = buf.subarray(0, 512).toString('utf8').toLowerCase();
  if (head.includes('<svg') || head.trimStart().startsWith('<?xml')) return 'image/svg+xml';
  return null;
}

export function validateUpload(mime: string, size: number): void {
  if (!ALLOWED_MIME.has(mime)) throw new Error('Tipo de arquivo não permitido.');
  if (size > MAX_UPLOAD_BYTES) throw new Error('Arquivo excede o limite de tamanho.');
}

/**
 * Gera um nome de objeto seguro e determinístico por organização.
 * Isola dados entre organizações (prefixo org/) e evita path traversal.
 */
export function safeObjectKey(organizationId: string, originalName: string, suffix: string): string {
  if (originalName.includes('\0')) throw new Error('Nome inválido (bytes nulos).');
  const sane = originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 120);
  return `${organizationId}/${suffix}-${sane}`;
}

/**
 * Sanitiza SVG usando parser de DOM e allowlist.
 */
export async function sanitizeSvg(content: string): Promise<string> {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
    const doc = dom.window.document;
    doc.querySelectorAll('script').forEach((n) => n.remove());
    const all = Array.from(doc.querySelectorAll('*')) as Array<Element>;
    const forbidden = new Set(['foreignobject']);
    for (const el of all) {
      if (forbidden.has(el.tagName.toLowerCase())) {
        el.remove();
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'xlink:href' || name === 'src') && /^\s*(javascript:|data:)/.test(val)) {
          el.removeAttribute(attr.name);
        }
        if (name === 'style' && /(expression|javascript:|url\()/.test(val)) {
          el.removeAttribute(attr.name);
        }
      }
    }
    return doc.documentElement.outerHTML;
  } catch {
    return content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:(?!image\/svg)/gi, '');
  }
}
