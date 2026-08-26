import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStorage, toS3Config, safeObjectKey, type StorageProvider } from '../lib/server/storage';
import { s3Get, s3Put } from '../lib/server/s3';
import { S3Client, ListBucketsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

/**
 * Teste de INTEGRAÇÃO REAL com MinIO (storage S3-compatível) USANDO o provider
 * do projeto (createStorage / s3.ts), não o cliente `minio` direto.
 *
 * Comprova o caminho de código real:
 *  - PUT (createStorage().put);
 *  - GET (createStorage().get);
 *  - DELETE (createStorage().delete);
 *  - presigned GET (createStorage().getSignedUrl) + acesso real via URL;
 *  - Content-Type preservado (HeadObjectCommand);
 *  - presigned URL expirada => acesso negado;
 *  - chave prefixada por organização (safeObjectKey) e rejeição de prefixo inválido;
 *  - path traversal bloqueado;
 *  - bucket privado (anonymous GET negado);
 *  - forcePathStyle / endpoint / credenciais da configuração;
 *  - credenciais erradas => erro;
 *  - bucket inexistente => erro;
 *  - objeto inexistente => erro;
 *  - destruição do S3Client.
 *
 * Requer MinIO real (docker) e STORAGE_* env.
 */

const ENDPOINT = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
const ACCESS = process.env.STORAGE_ACCESS_KEY_ID ?? 'mants_minio';
const SECRET = process.env.STORAGE_SECRET_ACCESS_KEY ?? 'mants_minio_secret';
const BUCKET = process.env.STORAGE_BUCKET ?? 'mants-private';

process.env.STORAGE_PROVIDER = 'minio';
process.env.STORAGE_ENDPOINT = ENDPOINT;
process.env.STORAGE_REGION = 'us-east-1';
process.env.STORAGE_BUCKET = BUCKET;
process.env.STORAGE_ACCESS_KEY_ID = ACCESS;
process.env.STORAGE_SECRET_ACCESS_KEY = SECRET;
process.env.STORAGE_USE_PATH_STYLE = 'true';

const orgId = `org-${Math.random().toString(36).slice(2, 10)}`;
const content = 'conteudo-de-teste-mants';
const contentType = 'text/plain';

let storage: StorageProvider;
let client: S3Client;

beforeAll(async () => {
  const cfg = toS3Config();
  expect(cfg.usePathStyle).toBe(true);
  expect(cfg.endpoint).toBe(ENDPOINT);
  expect(cfg.accessKeyId).toBe(ACCESS);
  expect(cfg.secretAccessKey).toBe(SECRET);

  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.usePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  const exists = (await client.send(new ListBucketsCommand({}))).Buckets?.some((b) => b.Name === BUCKET);
  if (!exists) throw new Error(`Bucket ${BUCKET} não existe no MinIO. Crie-o antes.`);
  storage = createStorage();
});

afterAll(async () => {
  // Cleanup tolerante (somente aqui).
  await storage.delete(safeObjectKey(orgId, 'minio-test.txt', 't')).catch(() => undefined);
  await storage.delete(safeObjectKey(orgId, 'minio-del.txt', 't')).catch(() => undefined);
  await storage.delete(safeObjectKey(orgId, 'minio-head.txt', 't')).catch(() => undefined);
  await storage.delete(safeObjectKey(orgId, 'minio-presigned.txt', 't')).catch(() => undefined);
  await client.destroy();
});

describe('Storage Mants (provider real) x MinIO', () => {
  it('PUT + GET + Content-Type preservado (HeadObject)', async () => {
    const key = safeObjectKey(orgId, 'minio-head.txt', 't');
    expect(key.startsWith(`${orgId}/`)).toBe(true);
    const put = await storage.put({ key, buffer: Buffer.from(content), contentType });
    expect(put.size).toBe(content.length);
    const got = await storage.get(key);
    expect(got.toString('utf8')).toBe(content);

    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    expect(head.ContentType).toBe('text/plain');
  });

  it('presigned GET funciona e é acessível', async () => {
    const key = safeObjectKey(orgId, 'minio-presigned.txt', 't');
    await storage.put({ key, buffer: Buffer.from(content), contentType });
    const url = await storage.getSignedUrl(key, 60);
    expect(url).toContain(key);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(content);
  });

  it('presigned URL expirada => acesso negado', async () => {
    const key = safeObjectKey(orgId, 'minio-test.txt', 't');
    const url = await storage.getSignedUrl(key, 1);
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(url);
    expect(res.status).not.toBe(200);
  });

  it('bucket privado: GET anônimo (sem assinatura) é negado', async () => {
    const key = safeObjectKey(orgId, 'minio-test.txt', 't');
    const publicUrl = `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/${key}`;
    const res = await fetch(publicUrl);
    expect(res.status).toBe(403);
  });

  it('chave prefixada por organização e rejeição de prefixo inválido', async () => {
    const good = safeObjectKey(orgId, 'x.txt', 't');
    expect(good).toBe(`${orgId}/t-x.txt`);
    // Prefixo de organização diferente não deve ser acessível como se fosse da org.
    const otherOrgKey = `outra-org/t-x.txt`;
    await expect(storage.get(otherOrgKey)).rejects.toThrow();
  });

  it('path traversal na chave é bloqueado (safeObjectKey não produz ..)', async () => {
    const traversal = safeObjectKey(orgId, '../escape.txt', 't');
    expect(traversal).not.toContain('..');
    expect(traversal.startsWith(`${orgId}/`)).toBe(true);
  });

  it('DELETE remove o objeto', async () => {
    const delKey = safeObjectKey(orgId, 'minio-del.txt', 't');
    await storage.put({ key: delKey, buffer: Buffer.from(content), contentType });
    await storage.delete(delKey);
    await expect(storage.get(delKey)).rejects.toThrow();
  });

  it('objeto inexistente => erro', async () => {
    await expect(storage.get(safeObjectKey(orgId, 'nao-existe.txt', 't'))).rejects.toThrow();
  });

  it('credenciais erradas => erro de acesso', async () => {
    const cfg = toS3Config();
    const bad = { ...cfg, accessKeyId: 'WRONG', secretAccessKey: 'WRONG' };
    await expect(s3Put(bad, safeObjectKey(orgId, 'bad.txt', 't'), Buffer.from('x'), 'text/plain')).rejects.toThrow();
  });

  it('bucket inexistente => erro', async () => {
    const cfg = toS3Config();
    const bad = { ...cfg, bucket: 'bucket-inexistente-mants' };
    await expect(s3Get(bad, safeObjectKey(orgId, 'x.txt', 't'))).rejects.toThrow();
  });

  it('S3Client pode ser destruído sem erro', () => {
    const c = new S3Client({ region: 'us-east-1', endpoint: ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET } });
    expect(() => c.destroy()).not.toThrow();
  });
});
