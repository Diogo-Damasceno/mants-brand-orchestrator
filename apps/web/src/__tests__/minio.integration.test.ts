import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'minio';

/**
 * Teste de INTEGRAÇÃO REAL com MinIO (storage S3-compatível).
 *
 * Sobe via docker compose (serviço `minio`). Valida:
 *  - PUT (upload);
 *  - GET (download);
 *  - DELETE;
 *  - URL assinada (presigned);
 *  - bucket privado (anonymous get negado);
 *  - content type;
 *  - chave com prefixo da organização.
 *
 * Requer MINIO_* env (ou defaults do docker compose local).
 */

const ENDPOINT = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
const ACCESS = process.env.STORAGE_ACCESS_KEY_ID ?? 'mants_minio';
const SECRET = process.env.STORAGE_SECRET_ACCESS_KEY ?? 'mants_minio_secret';
const BUCKET = process.env.STORAGE_BUCKET ?? 'mants-private';

if (!ENDPOINT || !ACCESS || !SECRET) {
  throw new Error('MinIO não configurado: defina STORAGE_ENDPOINT/ACCESS/SECRET.');
}

const url = new URL(ENDPOINT);
const client = new Client({
  endPoint: url.hostname,
  port: Number(url.port || (url.protocol === 'https:' ? 443 : 9000)),
  useSSL: url.protocol === 'https:',
  accessKey: ACCESS,
  secretKey: SECRET,
});

const orgId = `org-${Math.random().toString(36).slice(2, 10)}`;
const key = `${orgId}/minio-test/${crypto.randomUUID()}.txt`;
const content = 'conteudo-de-teste-mants';

beforeAll(async () => {
  const exists = await client.bucketExists(BUCKET).catch(() => false);
  if (!exists) await client.makeBucket(BUCKET);
  // Garante bucket privado (sem policy pública).
  await client.setBucketPolicy(BUCKET, '').catch(() => undefined);
});

afterAll(async () => {
  await client.removeObject(BUCKET, key).catch(() => undefined);
});

describe('MinIO (storage S3-compatível)', () => {
  it('PUT + GET + content type', async () => {
    await client.putObject(BUCKET, key, content, content.length, { 'Content-Type': 'text/plain' });
    const got = await client.getObject(BUCKET, key);
    const buf = [];
    for await (const chunk of got) buf.push(chunk);
    expect(Buffer.concat(buf).toString('utf8')).toBe(content);
  });

  it('URL assinada permite acesso temporário', async () => {
    await client.putObject(BUCKET, key, content, content.length, { 'Content-Type': 'text/plain' });
    const signed = await client.presignedGetObject(BUCKET, key, 60);
    expect(signed).toContain(key);
    // O próprio serviço responde 200 para a URL assinada.
    const res = await fetch(signed);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(content);
  });

  it('bucket privado: acesso anônimo é negado', async () => {
    await client.putObject(BUCKET, key, content, content.length, { 'Content-Type': 'text/plain' }).catch(() => undefined);
    // URL pública (sem assinatura) deve ser negada (403/404).
    const publicUrl = `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/${key}`;
    const res = await fetch(publicUrl);
    expect(res.status).toBe(403);
  });

  it('chave com prefixo da organização', async () => {
    expect(key.startsWith(`${orgId}/`)).toBe(true);
    await client.putObject(BUCKET, key, content, content.length, { 'Content-Type': 'text/plain' }).catch(() => undefined);
    const stat = await client.statObject(BUCKET, key);
    const ct = stat.metaData?.['content-type'] ?? stat.metaData?.['Content-Type'] ?? '';
    expect(ct).toBe('text/plain');
  });

  it('DELETE remove o objeto', async () => {
    const delKey = `${orgId}/minio-del/${crypto.randomUUID()}.txt`;
    await client.putObject(BUCKET, delKey, content, content.length);
    await client.removeObject(BUCKET, delKey);
    await expect(client.statObject(BUCKET, delKey)).rejects.toThrow();
  });
});
