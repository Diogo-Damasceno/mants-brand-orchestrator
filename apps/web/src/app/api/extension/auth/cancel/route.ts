import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/**
 * Cancelamento do fluxo de autorização (usuário desiste na tela /extension/authorize).
 * UPDATE atômico: só cancela se ainda não usado, não autorizado e não expirado.
 * Cancelamento e audit log ocorrem juntos (rollback se auditoria falhar).
 *
 * Regras de negação (internas, mesmo quando a resposta é genérica):
 *  - código inexistente                 -> 404
 *  - já utilizado (usedAt)              -> 409
 *  - já expirado                        -> 409
 *  - já autorizado a outro usuário/org  -> 409
 *  - contexto sem permissão            -> 403
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = await req.json();
    const code = String(body?.code ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();

    const [before] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
    if (!before) throw new HttpError(404, 'Código inválido.');
    if (before.usedAt) throw new HttpError(409, 'Código já utilizado.');
    if (before.expiresAt.getTime() < Date.now()) throw new HttpError(409, 'Código expirado.');
    if (before.userId && (before.userId !== ctx.userId || before.organizationId !== ctx.organizationId)) {
      throw new HttpError(409, 'Código pertence a outro usuário.');
    }
    // Só o usuário autenticado que iniciou a autorização pode cancelar.
    if (before.userId && before.userId !== ctx.userId) {
      throw new HttpError(403, 'Sem permissão para cancelar este fluxo.');
    }

    const updated = await db
      .update(schema.authCodes)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.authCodes.code, code),
          isNull(schema.authCodes.usedAt),
          isNull(schema.authCodes.userId),
          isNull(schema.authCodes.authorizedAt),
          isNull(schema.authCodes.cancelledAt),
          gt(schema.authCodes.expiresAt, new Date()),
        ),
      );

    if ((updated.rowCount ?? 0) === 0) {
      const [recheck] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
      if (!recheck) throw new HttpError(404, 'Código inválido.');
      if (recheck.usedAt) throw new HttpError(409, 'Código já utilizado.');
      if (recheck.expiresAt.getTime() < Date.now()) throw new HttpError(409, 'Código expirado.');
      if (recheck.userId) throw new HttpError(409, 'Código já autorizado.');
      throw new HttpError(409, 'Não foi possível cancelar.');
    }

    await db.insert(schema.auditLogs).values({
      id: randomUUID(),
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: 'extension_cancel',
      entity: 'auth_code',
      entityId: null,
      detail: { codeMasked: maskCode(code), deviceId: before.deviceId },
    });

    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

function maskCode(code: string): string {
  if (code.length <= 8) return '****';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}
