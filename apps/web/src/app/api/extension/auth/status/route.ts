import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';

/**
 * Status do fluxo de autorização, consultado pelo popup/background da extensão.
 * Não exige autenticação (o deviceId+code identificam o fluxo) e NÃO retorna
 * segredos. Estados possíveis: pending | authorized | used | expired | cancelled | not_found.
 */
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code') ?? '';
    const deviceId = req.nextUrl.searchParams.get('deviceId') ?? '';
    if (!code || !deviceId) throw new HttpError(400, 'Parâmetros ausentes.');
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.authCodes)
      .where(and(eq(schema.authCodes.code, code), eq(schema.authCodes.deviceId, deviceId)));
    if (!row) return json({ status: 'not_found' });
    let status: 'pending' | 'authorized' | 'used' | 'expired' | 'cancelled' = 'pending';
    if (row.cancelledAt) status = 'cancelled';
    else if (row.usedAt) status = 'used';
    else if (row.expiresAt.getTime() < Date.now()) status = 'expired';
    else if (row.userId) status = 'authorized';
    return json({
      status,
      authorized: Boolean(row.userId),
      organizationId: row.organizationId ?? null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
