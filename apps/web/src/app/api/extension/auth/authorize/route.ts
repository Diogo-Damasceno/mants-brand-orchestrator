import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/** Mascara um código para logs (nunca expõe o código completo). */
function maskCode(code: string): string {
  if (code.length <= 8) return '***';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}

/**
 * Passo 2 do fluxo PKCE (site autenticado).
 * GET: retorna metadados do código pendente para a tela de autorização visual.
 * POST: o usuário (logado via cookie) aprova explicitamente o acesso do dispositivo,
 *       ligando o auth_code ao usuário e organização reais e registrando aceite.
 *
 * CORREÇÃO: a expiração é parte da condição ATÔMICA do UPDATE (gt(expiresAt, now)),
 * portanto um código expirado NUNCA é marcado como autorizado antes do erro.
 * Autorização e audit log estão na MESMA transação: se a auditoria falhar, a
 * autorização sofre rollback.
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
    if (row.cancelledAt) throw new HttpError(409, 'Código cancelado.');
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

    // Transação única: UPDATE atômico (inclui expiração) + audit log.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.authCodes)
        .set({ userId: ctx.userId, organizationId: ctx.organizationId, authorizedAt: new Date() })
        .where(
          and(
            eq(schema.authCodes.code, code),
            isNull(schema.authCodes.usedAt),
            isNull(schema.authCodes.userId),
            isNull(schema.authCodes.authorizedAt),
            isNull(schema.authCodes.cancelledAt),
            gt(schema.authCodes.expiresAt, new Date()),
          ),
        )
        .returning();

      if (!row) {
        // Nenhuma linha atualizada: consulta apenas para MENSAGEM, sem alterar o registro.
        const [existing] = await tx
          .select({
            userId: schema.authCodes.userId,
            cancelledAt: schema.authCodes.cancelledAt,
            expiresAt: schema.authCodes.expiresAt,
            usedAt: schema.authCodes.usedAt,
          })
          .from(schema.authCodes)
          .where(eq(schema.authCodes.code, code));
        if (existing?.usedAt) throw new HttpError(409, 'Código já utilizado.');
        if (existing?.cancelledAt) throw new HttpError(409, 'Código cancelado.');
        if (existing?.expiresAt && existing.expiresAt.getTime() < Date.now())
          throw new HttpError(400, 'Código expirado.');
        if (existing?.userId) throw new HttpError(409, 'Código já autorizado.');
        throw new HttpError(404, 'Código inválido ou já utilizado.');
      }

      // Audit log DENTRO da transação (rollback em falha).
      await tx.insert(schema.auditLogs).values({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'extension_authorize',
        entity: 'auth_code',
        entityId: null,
        detail: { codeMasked: maskCode(row.code), deviceId: row.deviceId, browser: row.browser },
      });

      return { code: row.code, deviceId: row.deviceId, organizationId: ctx.organizationId };
    });

    return json({ ok: true, organizationId: result.organizationId, deviceId: result.deviceId });
  } catch (e) {
    return errorResponse(e);
  }
}
