import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';
import { hashSessionToken } from '@mants/auth';

/** Lista as sessões de extensão do usuário (sem hashes). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const rows = await db
      .select({
        id: schema.extensionSessions.id,
        deviceId: schema.extensionSessions.deviceId,
        status: schema.extensionSessions.status,
        createdAt: schema.extensionSessions.createdAt,
        expiresAt: schema.extensionSessions.expiresAt,
        revokedAt: schema.extensionSessions.revokedAt,
      })
      .from(schema.extensionSessions)
      .where(eq(schema.extensionSessions.userId, ctx.userId));
    return json({ sessions: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Logout da extensão (revoga somente a sessão autenticada por este Bearer). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace('Bearer ', '');
    const tokenHash = hashSessionToken(token);
    const db = getDb();
    // Revoga apenas a sessão do usuário autenticado que corresponde a este token.
    const result = await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(
        and(
          eq(schema.extensionSessions.tokenHash, tokenHash),
          eq(schema.extensionSessions.userId, ctx.userId),
          eq(schema.extensionSessions.status, 'active'),
        ),
      );
    void result;
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
