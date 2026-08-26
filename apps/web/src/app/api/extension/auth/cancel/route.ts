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
 * Cancelamento de um auth_code pendente (usuário clicou em "Cancelar").
 * Não apaga o código: marca cancelledAt para que jamais possa ser autorizado ou trocado.
 * Idempotente: cancelar novamente devolve ok:true sem erro.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();

    const [row] = await db
      .update(schema.authCodes)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.authCodes.code, code),
          isNull(schema.authCodes.usedAt),
          isNull(schema.authCodes.cancelledAt),
        ),
      )
      .returning();

    if (!row) {
      // Idempotente: já cancelado ou inexistente → confirma cancelamento sem vazar dados.
      const [existing] = await db
        .select({ usedAt: schema.authCodes.usedAt, cancelledAt: schema.authCodes.cancelledAt })
        .from(schema.authCodes)
        .where(eq(schema.authCodes.code, code));
      if (existing?.usedAt) throw new HttpError(409, 'Código já utilizado não pode ser cancelado.');
      // já cancelado ou não existe → considerado cancelado
      return json({ ok: true, cancelled: Boolean(existing?.cancelledAt ?? !existing) });
    }

    await db.insert(schema.auditLogs).values({
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: 'extension_auth_cancel',
      entity: 'auth_code',
      entityId: null,
      detail: { codeMasked: maskCode(row.code), deviceId: row.deviceId },
    });

    return json({ ok: true, cancelled: true });
  } catch (e) {
    return errorResponse(e);
  }
}
