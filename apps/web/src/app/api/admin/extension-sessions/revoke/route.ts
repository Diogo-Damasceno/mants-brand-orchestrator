import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError, isPlatformAdmin } from '@/lib/server/http';

/** Revoga todas as sessões de extensão de um usuário (procedimento de incidente). Não retorna hashes. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!isPlatformAdmin(ctx)) throw new HttpError(403, 'Acesso restrito.');
    const { userId } = (await req.json()) as { userId?: string };
    const db = getDb();
    await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(schema.extensionSessions.userId, userId ?? ctx.userId));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
