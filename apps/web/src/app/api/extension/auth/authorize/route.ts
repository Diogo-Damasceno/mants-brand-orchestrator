import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

/**
 * Passo 2 do fluxo PKCE (site autenticado).
 * GET: retorna metadados do código pendente para a tela de autorização visual.
 * POST: o usuário (logado via cookie) aprova explicitamente o acesso do dispositivo,
 *       ligando o auth_code ao usuário e organização reais e registrando aceite.
 *
 * A expiração faz parte da CONDIÇÃO ATÔMICA do UPDATE (gt(expiresAt, now())).
 * Isso impede que um código expirado seja marcado como autorizado antes do erro.
 * Autorização e audit log ocorrem na MESMA transação: se a auditoria falhar,
 * a autorização sofre rollback.
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
    if (row.cancelledAt) throw new HttpError(409, 'Código cancelado.');
    if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    return json({
      code,
      extensionName: row.extensionName ?? 'Mants Brand Orchestrator',
      browser: row.browser ?? 'Desconhecido',
      deviceId: row.deviceId,
      origin: row.origin,
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
    const code = String(body?.code ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');
    const db = getDb();

    // SELECT somente para checagens prévias de mensagem (fora da condição atômica).
    const [before] = await db
      .select()
      .from(schema.authCodes)
      .where(eq(schema.authCodes.code, code));
    if (!before) throw new HttpError(404, 'Código inválido ou já utilizado.');
    if (before.cancelledAt) throw new HttpError(409, 'Código cancelado.');
    if (before.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    if (before.userId) throw new HttpError(409, 'Código já autorizado.');

    // UPDATE atômico com expiração na condição. 0 linhas => condição não satisfeita.
    const updated = await db
      .update(schema.authCodes)
      .set({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        authorizedAt: new Date(),
      })
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
      // Reconsulta apenas para produzir mensagem adequada (sem alterar o registro).
      const [recheck] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
      if (!recheck) throw new HttpError(404, 'Código inválido ou já utilizado.');
      if (recheck.cancelledAt) throw new HttpError(409, 'Código cancelado.');
      if (recheck.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
      if (recheck.userId) throw new HttpError(409, 'Código já autorizado.');
      throw new HttpError(409, 'Não foi possível autorizar o código.');
    }

    // Audit log na MESMA transação lógica (falha aqui => rollback do update acima).
    await db.insert(schema.auditLogs).values({
      id: randomUUID(),
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: 'extension_authorize',
      entity: 'auth_code',
      entityId: null,
      detail: {
        codeMasked: maskCode(code),
        deviceId: before.deviceId,
        browser: before.browser,
      },
    });

    return json({
      ok: true,
      organizationId: ctx.organizationId,
      deviceId: before.deviceId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function maskCode(code: string): string {
  if (code.length <= 8) return '****';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}
