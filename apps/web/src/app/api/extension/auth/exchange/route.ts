import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { extensionCodeExchangeSchema } from '@mants/validation';
import { signSession, createPkceChallenge } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { assertAllowedOrigin } from '@/lib/server/extension';

function maskCode(code: string): string {
  if (code.length <= 8) return '***';
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}

/**
 * Passo 3 do fluxo PKCE (extensão).
 * Verifica PKCE S256 usando createPkceChallenge diretamente, origem allowlist,
 * código único vinculado a usuário real, consome o código em uma ÚNICA transação
 * (UPDATE ... RETURNING), valida membro, cria sessão e registra auditoria.
 * Se qualquer etapa falhar, o código NÃO fica consumido (rollback).
 */
export async function POST(req: NextRequest) {
  try {
    const body = extensionCodeExchangeSchema.parse(await req.json());
    assertAllowedOrigin(body.origin);

    const db = getDb();

    const result = await db.transaction(async (tx) => {
      // 1. Consome o código atomicamente (só se ainda não usado e não expirado).
      const [codeRow] = await tx
        .update(schema.authCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.authCodes.code, body.code),
            isNull(schema.authCodes.usedAt),
            gt(schema.authCodes.expiresAt, new Date()),
          ),
        )
        .returning();

      if (!codeRow) {
        throw new HttpError(400, 'Código inválido, expirado ou já utilizado (replay negado).');
      }
      if (!codeRow.userId || !codeRow.organizationId) {
        throw new HttpError(400, 'Código não autorizado pelo usuário.');
      }
      if (codeRow.deviceId !== body.deviceId) throw new HttpError(403, 'Dispositivo incompatível.');
      if (codeRow.origin !== body.origin) throw new HttpError(403, 'Origem incompatível (CSRF).');

      // 2. Verifica PKCE S256 usando a função canônica do pacote auth.
      const expected = createPkceChallenge(body.codeVerifier);
      if (expected !== codeRow.codeChallenge) {
        throw new HttpError(403, 'PKCE inválido (replay/CSRF).');
      }

      // 3. Papel real do usuário na organização.
      const [member] = await tx
        .select()
        .from(schema.organizationMembers)
        .where(
          and(
            eq(schema.organizationMembers.userId, codeRow.userId),
            eq(schema.organizationMembers.organizationId, codeRow.organizationId),
          ),
        );
      if (!member) throw new HttpError(403, 'Usuário não pertence mais à organização.');

      // 4. Cria sessão da extensão.
      const token = signSession(
        {
          sub: codeRow.userId,
          org: codeRow.organizationId,
          roles: [member.role],
          deviceId: body.deviceId,
          ext: true,
        },
        getServerConfig().authSecret,
        getServerConfig().sessionTtlSeconds,
      );
      const tokenHash = createPkceChallenge(token); // sha256 base64url como hash do token
      await tx.insert(schema.extensionSessions).values({
        userId: codeRow.userId,
        organizationId: codeRow.organizationId,
        deviceId: body.deviceId,
        tokenHash,
        expiresAt: new Date(Date.now() + getServerConfig().sessionTtlSeconds * 1000),
      });

      // 5. Auditoria (entityId é UUID; código NÃO é UUID — não gravar código completo).
      await tx.insert(schema.auditLogs).values({
        organizationId: codeRow.organizationId,
        actorId: codeRow.userId,
        action: 'extension_session_created',
        entity: 'auth_code',
        entityId: null,
        detail: { codeMasked: maskCode(codeRow.code), deviceId: body.deviceId, origin: body.origin },
      });

      return {
        token,
        expiresIn: getServerConfig().sessionTtlSeconds,
        userId: codeRow.userId,
        organizationId: codeRow.organizationId,
        roles: [member.role] as typeof member.role[],
      };
    });

    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
