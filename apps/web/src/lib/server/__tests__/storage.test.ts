import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configura o ambiente ANTES de importar os módulos (getServerConfig faz cache).
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('STORAGE_PROVIDER', 'local');
const ROOT = mkdtempSync(join(tmpdir(), 'mants-storage-'));
vi.stubEnv('STORAGE_LOCAL_ROOT', ROOT);

const { createStorage, safeObjectKey, detectMime, sanitizeSvg, validateUpload, ALLOWED_MIME } =
  await import('../storage');

describe('storage local - isolamento e contenção', () => {
  it('rejeita path traversal (..) fora da raiz', async () => {
    const s = createStorage();
    await expect(s.put({ key: '../escape.txt', buffer: Buffer.from('x'), contentType: 'text/plain' })).rejects.toThrow(
      /raiz permitida/,
    );
    await expect(s.put({ key: 'org/../../etc/passwd', buffer: Buffer.from('x'), contentType: 'text/plain' })).rejects.toThrow(
      /raiz permitida/,
    );
  });

  it('rejeita bytes nulos na chave', async () => {
    const s = createStorage();
    await expect(
      s.put({ key: 'org/a\0b.txt', buffer: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toThrow(/nulos/);
  });

  it('put/get/delete funciona dentro da raiz e isola por organização', async () => {
    const s = createStorage();
    const key = safeObjectKey('org-a', 'logo.png', 'asset');
    await s.put({ key, buffer: Buffer.from('binarydata'), contentType: 'image/png' });
    const got = await s.get(key);
    expect(got.toString()).toBe('binarydata');
    await s.delete(key);
    await expect(s.get(key)).rejects.toThrow();
  });

  it('não permite ler chave de outra organização via safeObjectKey', () => {
    const a = safeObjectKey('org-a', 'x.png', 'asset');
    const b = safeObjectKey('org-b', 'x.png', 'asset');
    expect(a.startsWith('org-a/')).toBe(true);
    expect(b.startsWith('org-b/')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('safeObjectKey', () => {
  it('normaliza nome e remove .. e caracteres perigosos', () => {
    const k = safeObjectKey('org-1', '../evil/../name!.png', 'asset');
    expect(k).not.toContain('..');
    expect(k.startsWith('org-1/')).toBe(true);
  });
  it('rejeita bytes nulos no nome original', () => {
    expect(() => safeObjectKey('org-1', 'a\0.png', 'asset')).toThrow(/nulos/);
  });
});

describe('detectMime', () => {
  it('detecta PNG/JPEG/PDF por magic bytes', () => {
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectMime(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBe('application/pdf');
  });
  it('detecta SVG por conteúdo', () => {
    expect(detectMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
  });
  it('retorna null para desconhecido', () => {
    expect(detectMime(Buffer.from('texto comum'))).toBeNull();
  });
});

describe('validateUpload', () => {
  it('aceita MIME permitido dentro do tamanho', () => {
    expect(() => validateUpload('image/png', 100)).not.toThrow();
  });
  it('rejeita MIME não permitido', () => {
    expect(() => validateUpload('application/x-msdownload', 10)).toThrow(/não permitido/);
  });
  it('rejeita acima do limite', () => {
    expect(() => validateUpload('image/png', 100 * 1024 * 1024)).toThrow(/limite/);
  });
  it('conjunto permitido inclui os formatos esperados', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']) {
      expect(ALLOWED_MIME.has(m)).toBe(true);
    }
  });
});

describe('sanitizeSvg', () => {
  it('remove <script> e handlers onclick', async () => {
    const dirty = '<svg><script>alert(1)</script><rect onclick="evil()" /></svg>';
    const clean = await sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
  });
  it('remove javascript: href', async () => {
    const dirty = '<svg><a href="javascript:alert(1)">x</a></svg>';
    const clean = await sanitizeSvg(dirty);
    expect(clean).not.toContain('javascript:');
  });
});
