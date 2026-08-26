import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { json } from '@/lib/server/http';

/**
 * Poll controlado do status de um auth_code (usado pelo background service worker).
 * Não expõe o código em si; apenas o estado derivado.
 * Diferencia explicitamente:
 *   - authorized (userId + authorizedAt preenchidos, não usado, não cancelado, não expirado)
 *   - cancelled
 *   - expired
 * Respostas genéricas para evitar enumeração de códigos válidos/inválidos.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? '';
  // Resposta neutra por padrão (código ausente/inválido não deve vazar estado).
  const neutral = { authorized: false, cancelled: false, expired: false };
  if (!code) return json(neutral);

  const db = getDb();
  const [row] = await db
    .select({
      userId: schema.authCodes.userId,
      authorizedAt: schema.authCodes.authorizedAt,
      cancelledAt: schema.authCodes.cancelledAt,
      usedAt: schema.authCodes.usedAt,
      expiresAt: schema.authCodes.expiresAt,
    })
    .from(schema.authCodes)
    .where(eq(schema.authCodes.code, code));

  if (!row) return json(neutral);
  if (row.cancelledAt) return json({ authorized: false, cancelled: true, expired: false });
  if (row.usedAt) return json({ authorized: false, cancelled: false, expired: false });
  if (row.expiresAt.getTime() < Date.now())
    return json({ authorized: false, cancelled: false, expired: true });
  if (row.userId && row.authorizedAt)
    return json({ authorized: true, cancelled: false, expired: false });
  return json({ authorized: false, cancelled: false, expired: false });
}
