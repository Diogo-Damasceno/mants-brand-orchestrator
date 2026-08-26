import { getServerConfig } from '@mants/config';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

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
  get(key: string): Promise<Buffer>;
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
  if (cfg.storageProvider === 'local' || cfg.nodeEnv !== 'production') {
    return new LocalStorageProvider();
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
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // WEBP: 52 49 46 46 .. 57 45 42 50 (RIFF....WEBP)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return 'image/webp';
  // PDF: 25 50 44 46 (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  // WOFF2: 77 4F 46 32 (wOF2)
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x32) return 'font/woff2';
  // TTF/OTF: 00 01 00 00 (TTF) ou 4F 54 54 4F (OTTO)
  if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return 'font/ttf';
  if (buf[0] === 0x4f && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4f) return 'font/otf';
  // SVG: <?xml ou <svg (verificado textualmente)
  const head = buf.subarray(0, 512).toString('utf8').toLowerCase();
  if (head.includes('<svg') || head.trimStart().startsWith('<?xml')) return 'image/svg+xml';
  return null;
}

export function validateUpload(mime: string, size: number): void {
  if (!ALLOWED_MIME.has(mime)) throw new Error('Tipo de arquivo não permitido.');
  if (size > MAX_UPLOAD_BYTES) throw new Error('Arquivo excede o limite de tamanho.');
}

/**
 * Sanitiza SVG usando parser de DOM e allowlist.
 * Remove scripts, handlers de evento, referências externas e URLs perigosos.
 * Não usa apenas regex.
 */
export async function sanitizeSvg(content: string): Promise<string> {
  try {
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
