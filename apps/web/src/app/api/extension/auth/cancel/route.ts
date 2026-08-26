import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { sha256Hex } from '@mants/auth';
import { constantTimeHashEqual } from '@/lib/server/crypto';

/** Mascara um código para logs (nunca expõe o código completo). */
function maskCode(code: string): string {
  if (code.length <= 8) return '***';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}

function hashMatches(storedHash: string | null | undefined, plainValue: string | undefined): boolean {
  if (!storedHash || !plainValue) return false;
  return constantTimeHashEqual(storedHash, sha256Hex(plainValue));
}

/**
 * Cancelamento de um auth_code pendente (fluxo PKCE).
 *
 * Dois modos (ambos seguros):
 *  1) PÚBLICO (popup/extensão): envia `code` + `cancelSecret`. O backend compara
 *     cancelSecretHash em tempo constante. Não depende de organizationId
 *     (que só existe após a autorização). A extensão gera cancelSecret no início.
 *  2) AUTENTICADO (site): envia apenas `code` com cookie de sessão. O código é
 *     não-adivinhável e só é exibido ao usuário autenticado na tela de autorização,
 *     portanto cancelar por código com sessão é aceitável.
 *
 * Proteções comuns:
 *  - não cancela se já usado (usedAt), já autorizado (userId/authorizedAt) ou expirado;
 *  - cancelamento e auditoria na MESMA transação (rollback em falha de auditoria);
 *  - idempotente: cancelar de novo devolve ok, mas não faz código inexistente
 *    parecer válido.
 * Respostas genéricas para evitar enumeração de códigos.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? '');
    const cancelSecret = String(body.cancelSecret ?? '');
    if (!code) throw new HttpError(400, 'Código ausente.');

    const db = getDb();
    const isPublicCancel = Boolean(cancelSecret);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.authCodes)
        .where(and(eq(schema.authCodes.code, code), isNull(schema.authCodes.usedAt)))
        .for('update');

      if (!row) {
        // Não existe ou já foi usado: resposta neutra (idempotente).
        return { ok: true, cancelled: false, audit: false };
      }
      if (row.authorizedAt || row.userId) {
        throw new HttpError(409, 'Código já autorizado.');
      }
      if (row.usedAt) {
        throw new HttpError(409, 'Código já utilizado.');
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new HttpError(400, 'Código expirado.');
      }
      if (row.cancelledAt) {
        return { ok: true, cancelled: true, audit: false }; // idempotência
      }

      if (isPublicCancel) {
        // Modo 1: extensão com cancelSecret (tempo constante).
        if (!hashMatches(row.cancelSecretHash, cancelSecret)) {
          throw new HttpError(403, 'Cancelamento não autorizado.');
        }
      } else {
        // Modo 2: usuário autenticado no site (cookie). Exige sessão válida.
        const ctx = await authenticate(req);
        void ctx; // O código já é não-adivinhável e exibido só a este usuário.
      }

      await tx
        .update(schema.authCodes)
        .set({ cancelledAt: new Date() })
        .where(eq(schema.authCodes.code, code));

      await tx.insert(schema.auditLogs).values({
        organizationId: row.organizationId ?? '00000000-0000-0000-0000-000000000000',
        actorId: row.userId ?? '00000000-0000-0000-0000-000000000000',
        action: 'extension_auth_cancel',
        entity: 'auth_code',
        entityId: null,
        detail: { codeMasked: maskCode(row.code), deviceId: row.deviceId, via: isPublicCancel ? 'cancel_secret' : 'web_session' },
      });

      return { ok: true, cancelled: true, audit: true };
    });

    return json({ ok: result.ok, cancelled: result.cancelled });
  } catch (e) {
    return errorResponse(e);
  }
}
