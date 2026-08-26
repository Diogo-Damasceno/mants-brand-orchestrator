import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { json, HttpError } from '@/lib/server/http';
import { verifySession, hashSessionToken } from '@mants/auth';
import { getServerConfig } from '@mants/config';

/**
 * Validação REAL da sessão da extensão no backend.
 *
 * O popup/side panel NÃO deve confiar apenas no storage local. Ao abrir, ele
 * envia o token (Bearer) e este endpoint verifica, no servidor:
 *   1. assinatura do token (HMAC-SHA256 via verifySession);
 *   2. expiração do token;
 *   3. revogação (status='active' em extension_sessions);
 *   4. usuário existe e não está deletado;
 *   5. organização existe;
 *   6. membership do usuário na organização.
 *
 * Retorna um payload estruturado { valid, ... } para que o cliente possa
 * diferenciar "token inválido/expirado/revogado" de "API indisponível".
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new HttpError(401, 'Não autenticado.');

    // 1+2: assinatura e expiração do JWT.
    const claims = verifySession(token, getServerConfig().authSecret);
    if (!claims) throw new HttpError(401, 'Sessão inválida ou expirada.');
    if (!claims.ext) throw new HttpError(403, 'Token não é de sessão de extensão.');

    const db = getDb();

    // 3: revogação e expiração no banco (não confia só no exp do token).
    const [sess] = await db
      .select()
      .from(schema.extensionSessions)
      .where(
        and(
          eq(schema.extensionSessions.tokenHash, hashSessionToken(token)),
          eq(schema.extensionSessions.userId, claims.sub),
          eq(schema.extensionSessions.organizationId, claims.org),
          eq(schema.extensionSessions.status, 'active'),
        ),
      );
    if (!sess) throw new HttpError(401, 'Sessão de extensão revogada ou inexistente.');
    // Expiração real no servidor (defesa em profundidade contra token expirado).
    if (sess.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(401, 'Sessão de extensão expirada no servidor.');
    }

    // 4: usuário existe e não está deletado.
    const [user] = await db
      .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, claims.sub));
    if (!user || user.deletedAt) throw new HttpError(401, 'Usuário inexistente.');

    // 5: organização existe.
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, claims.org));
    if (!org) throw new HttpError(401, 'Organização inexistente.');

    // 6: membership — usa a ROLE ATUAL da membership, não o claim do token
    // (o papel do usuário pode ter mudado desde a emissão do token).
    const [member] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.userId, claims.sub),
          eq(schema.organizationMembers.organizationId, claims.org),
        ),
      );
    if (!member) throw new HttpError(401, 'Usuário não pertence mais à organização.');

    return json({
      valid: true,
      userId: claims.sub,
      organizationId: claims.org,
      roles: [member.role],
      status: sess.status,
      expiresAt: sess.expiresAt.getTime(),
    });
  } catch (e) {
    if (e instanceof HttpError) {
      // Resposta estruturada: o cliente decide limpar ou manter em caso de rede.
      return json({ valid: false, reason: e.message }, e.status);
    }
    // Erro interno: 500 (NÃO deve ser tratado como sessão inválida pelo cliente).
    return json({ valid: false, reason: 'Erro interno ao validar sessão.' }, 500);
  }
}
