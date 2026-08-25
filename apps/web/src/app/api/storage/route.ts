import { NextRequest } from 'next/server';
import { createStorage } from '@/lib/server/storage';
import { authenticate, errorResponse, HttpError } from '@/lib/server/http';

/** Download de arquivo privado do storage (somente com sessão válida). */
export async function GET_file(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const key = req.nextUrl.searchParams.get('key');
    if (!key) throw new HttpError(400, 'Chave ausente.');
    // Validação de path traversal
    if (key.includes('..') || key.startsWith('/')) throw new HttpError(400, 'Chave inválida.');
    void ctx;
    const storage = createStorage();
    const url = await storage.getSignedUrl(key, 60);
    // Em dev, redireciona para leitura local.
    const fs = await import('node:fs/promises');
    const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT ?? '/tmp/mants-storage';
    const buf = await fs.readFile(`${LOCAL_ROOT}/${key}`);
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' },
    });
    void url;
  } catch (e) {
    return errorResponse(e);
  }
}
