/**
 * Cliente S3-compatível mínimo e autocontido (AWS Signature V4 + fetch).
 * Suporta MinIO (dev), Amazon S3 e Cloudflare R2 em produção.
 * Sem dependências externas: usa node:crypto e fetch global.
 *
 * Presigned URLs de download usam query-string auth (SigV4), válidas por tempo
 * limitado, sem expor credencial nem token de sessão na própria URL de conteúdo.
 */
import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  endpoint: string; // ex.: http://localhost:9000 (MinIO) ou https://<accountid>.r2.cloudflarestorage.com
  region: string; // us-east-1 / auto (R2)
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  usePathStyle: boolean; // true p/ MinIO; false p/ S3/R2 (virtual-hosted)
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function isoDate(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function yyyymmdd(date: Date): string {
  return isoDate(date).slice(0, 8);
}

/** Monta o host e a URL base do objeto conforme o estilo (path/virtual). */
function objectUrl(cfg: S3Config, key: string): { url: string; host: string } {
  const base = cfg.endpoint.replace(/\/+$/, '');
  if (cfg.usePathStyle) {
    const u = `${base}/${cfg.bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    return { url: u, host: new URL(base).host };
  }
  const host = `${cfg.bucket}.${new URL(base).host}`;
  return { url: `https://${host}/${encodeURIComponent(key).replace(/%2F/g, '/')}`, host };
}

interface SignOpts {
  method: string;
  url: string;
  host: string;
  region: string;
  bodySha256: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

interface SignResult {
  authorization: string;
  amzDate: string;
  signedHeaders: string;
}

function signRequest(cfg: S3Config, opts: SignOpts): SignResult {
  const date = new Date();
  const amzDate = isoDate(date);
  const scope = `${yyyymmdd(date)}/${opts.region}/s3/aws4_request`;
  const credential = `${cfg.accessKeyId}/${scope}`;

  const q = opts.query ?? {};
  const signedHeadersList = ['host', ...Object.keys(opts.headers ?? {}).map((h) => h.toLowerCase())]
    .filter((h, i, a) => a.indexOf(h) === i)
    .sort();
  const signedHeaders = signedHeadersList.join(';');

  const canonicalHeaders =
    `host:${opts.host}\n` +
    Object.entries(opts.headers ?? {})
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
      .join('');

  const canonicalQuery = Object.entries(q)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');

  const canonicalRequest = [
    opts.method,
    new URL(opts.url).pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    opts.bodySha256,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, yyyymmdd(date));
  const kRegion = hmac(kDate, opts.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate, signedHeaders };
}

/** Gera uma URL pré-assinada (query-string auth) para GET do objeto. */
export function presignGet(cfg: S3Config, key: string, expiresSeconds: number): string {
  const { url, host } = objectUrl(cfg, key);
  const date = new Date();
  const amzDate = isoDate(date);
  const scope = `${yyyymmdd(date)}/${cfg.region}/s3/aws4_request`;
  const q: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.entries(q)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');
  const canonicalRequest = ['GET', new URL(url).pathname, canonicalQuery, `host:${host}\n`, 'host', sha256Hex('')].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, yyyymmdd(date));
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export async function s3Put(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const { url, host } = objectUrl(cfg, key);
  const bodySha = sha256Hex(body);
  const { authorization, amzDate } = signRequest(cfg, {
    method: 'PUT',
    url,
    host,
    region: cfg.region,
    bodySha256: bodySha,
    headers: { 'content-type': contentType, 'x-amz-content-sha256': bodySha },
  });
  const headers: Record<string, string> = {
    Authorization: authorization,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': bodySha,
    'Content-Type': contentType,
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha ao enviar objeto (${res.status}): ${txt.slice(0, 200)}`);
  }
}

export async function s3Get(cfg: S3Config, key: string): Promise<Buffer> {
  const { url, host } = objectUrl(cfg, key);
  const bodySha = sha256Hex('');
  const { authorization, amzDate } = signRequest(cfg, {
    method: 'GET',
    url,
    host,
    region: cfg.region,
    bodySha256: bodySha,
    headers: { 'x-amz-content-sha256': bodySha },
  });
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authorization, 'X-Amz-Date': amzDate, 'X-Amz-Content-Sha256': bodySha },
  });
  if (!res.ok) throw new Error(`Falha ao baixar objeto (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function s3Delete(cfg: S3Config, key: string): Promise<void> {
  const { url, host } = objectUrl(cfg, key);
  const bodySha = sha256Hex('');
  const { authorization, amzDate } = signRequest(cfg, {
    method: 'DELETE',
    url,
    host,
    region: cfg.region,
    bodySha256: bodySha,
    headers: { 'x-amz-content-sha256': bodySha },
  });
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authorization, 'X-Amz-Date': amzDate, 'X-Amz-Content-Sha256': bodySha },
  });
  if (!res.ok && res.status !== 204) throw new Error(`Falha ao excluir objeto (${res.status}).`);
}

export { objectUrl };
