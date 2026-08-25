import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';

/** Revoga uma sessão específica da extensão (apenas se for do usuário). */
export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const context = ctx2 as { params: { id: string } };
    const id = context.params.id;
    const ctx = await authenticate(req);
    const db = getDb();
    await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(and(eq(schema.extensionSessions.id, id), eq(schema.extensionSessions.userId, ctx.userId)));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
