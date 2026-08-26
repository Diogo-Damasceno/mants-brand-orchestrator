import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';
import { sha256Hex } from '@mants/auth';

/**
 * Sessão da extensão via Bearer token.
 * Endpoint dedicado e estável para o popup/background verificarem a sessão
 * (diferente de /api/auth/me, que é para a web via cookie).
 * Verifica revogação no banco e retorna os dados da sessão.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const db = getDb();
    const [sess] = await db
      .select()
      .from(schema.extensionSessions)
      .where(
        and(
          eq(schema.extensionSessions.tokenHash, sha256Hex(token)),
          eq(schema.extensionSessions.userId, ctx.userId),
          eq(schema.extensionSessions.organizationId, ctx.organizationId),
          eq(schema.extensionSessions.status, 'active'),
        ),
      );
    return json({
      authenticated: Boolean(sess),
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      roles: ctx.roles,
      expiresAt: sess?.expiresAt ?? null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
