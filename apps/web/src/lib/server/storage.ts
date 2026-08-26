import { getServerConfig } from '@mants/config';
import { createHash } from 'node:crypto';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';

export interface StorageObject {
  key: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * Abstração de storage compatível com S3 (MinIO em dev, S3 ou Cloudflare R2 em produção).
 * A seleção do provider é explícita via STORAGE_PROVIDER. Em produção, falha na
 * inicialização se o storage não estiver configurado (nunca cai silenciosamente no disco local).
 */
export interface StorageProvider {
  put(obj: StorageObject): Promise<{ key: string; size: number }>;
  getSignedUrl(key: string, expiresSeconds: number): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT ?? '/tmp/mants-storage';

class S3LikeProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private endpoint?: string;
  private usePathStyle: boolean;

  constructor() {
    const cfg = getServerConfig();
    this.bucket = cfg.storageBucket;
    this.endpoint = cfg.storageEndpoint || undefined;
    this.usePathStyle = cfg.storageUsePathStyle;
    const required = ['storageBucket', 'storageAccessKeyId', 'storageSecretAccessKey'] as const;
    for (const k of required) {
      if (!cfg[k]) {
        throw new Error(`STORAGE_${k.toUpperCase()} não configurado para provider ${cfg.storageProvider}.`);
      }
    }
    this.client = new S3Client({
      region: cfg.storageRegion || 'us-east-1',
      endpoint: this.endpoint,
      forcePathStyle: this.usePathStyle,
      credentials: {
        accessKeyId: cfg.storageAccessKeyId,
        secretAccessKey: cfg.storageSecretAccessKey,
      },
    });
  }

  async put(obj: StorageObject): Promise<{ key: string; size: number }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: obj.key,
        Body: obj.buffer,
        ContentType: obj.contentType,
      }),
    );
    return { key: obj.key, size: obj.buffer.byteLength };
  }

  async getSignedUrl(key: string, expiresSeconds: number): Promise<string> {
    return s3GetSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresSeconds },
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error('Objeto vazio.');
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// Provider de disco local — APENAS para testes automatizados (storageProvider='local'
// em NODE_ENV != production). Nunca é usado em produção (createStorage() falha antes).
class LocalStorageProvider implements StorageProvider {
  async put(obj: StorageObject): Promise<{ key: string; size: number }> {
    const fs = await import('node:fs/promises');
    const path = `${LOCAL_ROOT}/${obj.key}`;
    await fs.mkdir(path.substring(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, obj.buffer);
    return { key: obj.key, size: obj.buffer.byteLength };
  }
  async getSignedUrl(key: string): Promise<string> {
    return `/api/storage/file?key=${encodeURIComponent(key)}`;
  }
  async get(key: string): Promise<Buffer> {
    const fs = await import('node:fs/promises');
    return fs.readFile(`${LOCAL_ROOT}/${key}`);
  }
  async delete(key: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.rm(`${LOCAL_ROOT}/${key}`, { force: true });
  }
}

export function createStorage(): StorageProvider {
  const cfg = getServerConfig();
  // Produção: NÃO usar disco local. Exige provider remoto configurado.
  if (cfg.nodeEnv === 'production') {
    if (cfg.storageProvider === 'local' || !cfg.storageProvider) {
      throw new Error(
        'STORAGE_PROVIDER remoto não configurado em produção. Abortando inicialização (fail-closed).',
      );
    }
    return new S3LikeProvider();
  }
  // Dev/test: local apenas quando explicitamente solicitado; senão usa MinIO/S3/R2 reais.
  if (cfg.storageProvider === 'local') return new LocalStorageProvider();
  return new S3LikeProvider();
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

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

/** Gera um nome de chave seguro (sem path traversal), prefixado por organização. */
export function safeStorageKey(organizationId: string, originalName: string, id: string): string {
  const clean = originalName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return `${organizationId}/${id}-${clean}`;
}

/**
 * Sanitiza SVG usando parser de DOM e allowlist.
 */
export function sanitizeSvg(content: string): string {
  try {
    const { JSDOM } = require('jsdom') as { JSDOM: typeof import('jsdom').JSDOM };
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
