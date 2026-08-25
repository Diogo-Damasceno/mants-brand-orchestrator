import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';
import { sha256Hex } from '@mants/auth';

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

/** Logout da extensão (revoga a sessão informada via Bearer) ou todas. */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace('Bearer ', '');
    const db = getDb();
    const tokenHash = sha256Hex(token);
    await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(schema.extensionSessions.tokenHash, tokenHash));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
