/**
 * Cliente S3-compatível baseado em @aws-sdk/client-s3.
 * Suporta MinIO (dev), Amazon S3 e Cloudflare R2 em produção.
 *
 * Vantagens em relação a uma implementação SigV4 manual:
 *  - canonicalização e assinatura mantidas pela AWS (correta entre S3/R2/MinIO);
 *  - forcePathStyle configurável (MinIO exige path-style; S3/R2 usam virtual-hosted);
 *  - presigned GET via @aws-sdk/s3-request-presigner.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  endpoint: string; // ex.: http://localhost:9000 (MinIO) ou https://<accountid>.r2.cloudflarestorage.com
  region: string; // us-east-1 / auto (R2)
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  usePathStyle: boolean; // true p/ MinIO; false p/ S3/R2 (virtual-hosted)
}

function buildClient(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.usePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/** Envia um objeto (PutObjectCommand). */
export async function s3Put(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const client = buildClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Baixa um objeto e devolve o conteúdo como Buffer. */
export async function s3Get(cfg: S3Config, key: string): Promise<Buffer> {
  const client = buildClient(cfg);
  const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!res.Body) throw new Error('Resposta vazia do storage.');
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Exclui um objeto (DeleteObjectCommand). */
export async function s3Delete(cfg: S3Config, key: string): Promise<void> {
  const client = buildClient(cfg);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/** Gera uma URL pré-assinada (query-string auth) para GET do objeto. */
export async function presignGet(cfg: S3Config, key: string, expiresSeconds: number): Promise<string> {
  const client = buildClient(cfg);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: expiresSeconds },
  );
}
