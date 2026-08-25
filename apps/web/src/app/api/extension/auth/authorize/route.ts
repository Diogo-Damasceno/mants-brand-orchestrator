import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/**
 * Passo 2 do fluxo PKCE (site autenticado).
 * GET: retorna metadados do código pendente para a tela de autorização visual.
 * POST: o usuário (logado via cookie) aprova explicitamente o acesso do dispositivo,
 *       ligando o auth_code ao usuário e organização reais e registrando aceite.
 */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const code = req.nextUrl.searchParams.get('code') ?? '';
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.authCodes)
      .where(and(eq(schema.authCodes.code, code), isNull(schema.authCodes.usedAt)));
    if (!row) throw new HttpError(404, 'Código inválido ou já utilizado.');
    if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    return json({
      code,
      extensionName: row.extensionName ?? 'Mants Brand Orchestrator',
      browser: row.browser ?? 'Desconhecido',
      deviceId: row.deviceId,
      origin: row.origin,
      organizationId: row.organizationId,
      authorized: Boolean(row.userId),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

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
    await db.insert(schema.auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: 'extension_authorize',
      entity: 'auth_code',
      entityId: row.code,
      detail: { deviceId: row.deviceId, browser: row.browser },
    });
    return json({
      ok: true,
      organizationId: ctx.organizationId,
      deviceId: row.deviceId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
