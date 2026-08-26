import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/** Mascara um código para logs (nunca expõe o código completo). */
function maskCode(code: string): string {
  if (code.length <= 8) return '***';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}

/**
 * Cancelamento de um auth_code pendente.
 * NÃO apaga o código: marca cancelledAt para que jamais possa ser autorizado/trocado.
 *
 * Proteções:
 *  - não cancela se já usado (usedAt), expirado ou já autorizado (userId/authorizedAt);
 *  - só o usuário autenticado no contexto correto pode cancelar o fluxo que lhe pertence;
 *  - cancelamento e audit log na MESMA transação (rollback em falha de auditoria);
 *  - idempotente: cancelar de novo devolve ok, mas não faz um código inexistente
 *    parecer válido (o comportamento interno distingue os casos).
 * Respostas genéricas para evitar enumeração de códigos válidos.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.authCodes)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(schema.authCodes.code, code),
            isNull(schema.authCodes.usedAt),
            isNull(schema.authCodes.cancelledAt),
            // Só pode cancelar fluxo ainda não autorizado.
            isNull(schema.authCodes.authorizedAt),
            // Só o contexto que pode autorizar (mesmo usuário/org) cancela.
            eq(schema.authCodes.organizationId, ctx.organizationId),
          ),
        )
        .returning();

      if (!row) {
        // Consulta apenas para distinguir o caso (sem alterar o registro).
        const [existing] = await tx
          .select({
            usedAt: schema.authCodes.usedAt,
            cancelledAt: schema.authCodes.cancelledAt,
            authorizedAt: schema.authCodes.authorizedAt,
            expiresAt: schema.authCodes.expiresAt,
            organizationId: schema.authCodes.organizationId,
            userId: schema.authCodes.userId,
          })
          .from(schema.authCodes)
          .where(eq(schema.authCodes.code, code));

        // Bloqueios explícitos (mas resposta genérica ao cliente).
        if (existing?.usedAt) throw new HttpError(409, 'Código já utilizado.');
        if (existing?.authorizedAt) throw new HttpError(409, 'Código já autorizado.');
        if (existing?.organizationId && existing.organizationId !== ctx.organizationId)
          throw new HttpError(403, 'Sem permissão para cancelar este fluxo.');
        if (existing?.expiresAt && existing.expiresAt.getTime() < Date.now())
          throw new HttpError(400, 'Código expirado.');
        // Idempotência: já cancelado ou inexistente -> confirma cancelamento.
        return { cancelled: Boolean(existing?.cancelledAt ?? !existing), audit: Boolean(existing?.cancelledAt) };
      }

      await tx.insert(schema.auditLogs).values({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: 'extension_auth_cancel',
        entity: 'auth_code',
        entityId: null,
        detail: { codeMasked: maskCode(row.code), deviceId: row.deviceId },
      });
      return { cancelled: true, audit: true };
    });

    return json({ ok: true, cancelled: result.cancelled });
  } catch (e) {
    return errorResponse(e);
  }
}
