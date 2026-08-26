import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createStorage,
  safeStorageKey,
  detectMime,
  validateUpload,
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
} from '@/lib/server/storage';

describe('Storage (provider local de teste)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mants-storage-'));
    process.env.STORAGE_LOCAL_ROOT = root;
    process.env.STORAGE_PROVIDER = 'local';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('put/get/delete roundtrip', async () => {
    const storage = createStorage();
    const key = 'org-1/file-abc.png';
    const buf = Buffer.from('hello-mants');
    const put = await storage.put({ key, buffer: buf, contentType: 'image/png' });
    expect(put.size).toBe(buf.byteLength);
    const got = await storage.get(key);
    expect(got.toString()).toBe('hello-mants');
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toBeTruthy();
  });

  it('getSignedUrl não expõe credencial em produção local (fail-closed)', async () => {
    const storage = createStorage();
    const url = await storage.getSignedUrl('org-1/x.png', 60);
    expect(typeof url).toBe('string');
  });
});

describe('Storage — nomes seguros, MIME e tamanho', () => {
  it('safeStorageKey isola por organização e sanitiza nome', () => {
    const k = safeStorageKey('org-1', '../../evil.png', 'id1');
    expect(k.startsWith('org-1/')).toBe(true);
    expect(k).not.toContain('..');
    expect(k).toContain('id1');
    expect(k).toContain('evil.png');
  });

  it('detectMime reconhece PNG/JPEG/WEBP/PDF por magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(detectMime(png)).toBe('image/png');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(detectMime(jpeg)).toBe('image/jpeg');
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectMime(webp)).toBe('image/webp');
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    expect(detectMime(pdf)).toBe('application/pdf');
  });

  it('detectMime retorna null para tipo desconhecido', () => {
    expect(detectMime(Buffer.from([0, 1, 2, 3]))).toBeNull();
  });

  it('validateUpload rejeita MIME não permitido e tamanho excessivo', () => {
    expect(ALLOWED_MIME.has('image/png')).toBe(true);
    expect(() => validateUpload('image/png', 10)).not.toThrow();
    expect(() => validateUpload('application/x-msdownload', 10)).toThrow();
    expect(() => validateUpload('image/png', MAX_UPLOAD_BYTES + 1)).toThrow();
  });
});

describe('Storage — fail-closed em produção', () => {
  const realEnv = { ...process.env };
  afterAll(() => {
    process.env = realEnv;
  });

  it('em produção sem provider remoto, createStorage lança', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_PROVIDER = 'local';
    delete process.env.STORAGE_BUCKET;
    expect(() => createStorage()).toThrow(/produção|fail-closed/i);
  });

  it('em produção com provider remoto configurado, cria provider', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_PROVIDER = 'minio';
    process.env.STORAGE_BUCKET = 'mants-private';
    process.env.STORAGE_ACCESS_KEY_ID = 'key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'secret';
    process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
    expect(() => createStorage()).not.toThrow();
  });
});
