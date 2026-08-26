import { NextRequest } from 'next/server';
import { createStorage } from '@/lib/server/storage';
import { authenticate, errorResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Download de arquivo do storage local (desenvimento).
 * Proteções:
 *  - exige sessão (cookie);
 *  - o key deve começar com a organizationId do contexto (isolamento);
 *  - rejeita path traversal / bytes nulos (safeLocalPath no provider);
 *  - não serve arquivos de outra organização.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const key = req.nextUrl.searchParams.get('key') ?? '';
    if (!key) throw new Error('Chave ausente.');
    if (!key.startsWith(`${ctx.organizationId}/`)) {
      throw new Error('Acesso negado a recurso de outra organização.');
    }
    const storage = createStorage();
    const buf = await storage.get(key);
    const mime = req.nextUrl.searchParams.get('mime') ?? 'application/octet-stream';
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': mime, 'Content-Disposition': 'inline' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
