import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/**
 * Passo 2 do fluxo PKCE (site autenticado).
 * O usuário (logado via cookie) aprova explicitamente o acesso do dispositivo.
 * Liga o auth_code pendente ao usuário e organização reais.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = await req.json();
    const code = String(body.code ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.authCodes)
      .where(and(eq(schema.authCodes.code, code), isNull(schema.authCodes.usedAt)));
    if (!row) throw new HttpError(404, 'Código inválido ou já utilizado.');
    if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    if (row.userId) throw new HttpError(409, 'Código já autorizado.');
    await db
      .update(schema.authCodes)
      .set({ userId: ctx.userId, organizationId: ctx.organizationId })
      .where(eq(schema.authCodes.code, code));
    return json({
      ok: true,
      organizationId: ctx.organizationId,
      deviceId: row.deviceId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
