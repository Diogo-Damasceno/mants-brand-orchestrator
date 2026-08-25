import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { extensionCodeExchangeSchema } from '@mants/validation';
import { signSession, sha256Hex, base64url } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { assertAllowedOrigin } from '@/lib/server/extension';

/**
 * Passo 3 do fluxo PKCE (extensão).
 * Verifica PKCE (S256), origem allowlist, código único vinculado a usuário real,
 * consome o código atomicamente (UPDATE ... WHERE used_at IS NULL AND expires > now, com rowCount),
 * e emite sessão curta da extensão com papel real do usuário.
 */
export async function POST(req: NextRequest) {
  try {
    const body = extensionCodeExchangeSchema.parse(await req.json());
    assertAllowedOrigin(body.origin);

    const db = getDb();
    const [codeRow] = await db
      .select()
      .from(schema.authCodes)
      .where(and(eq(schema.authCodes.code, body.code), isNull(schema.authCodes.usedAt)));
    if (!codeRow) throw new HttpError(400, 'Código inválido.');
    if (codeRow.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    if (!codeRow.userId || !codeRow.organizationId) {
      throw new HttpError(400, 'Código não autorizado pelo usuário.');
    }
    if (codeRow.deviceId !== body.deviceId) throw new HttpError(403, 'Dispositivo incompatível.');
    if (codeRow.origin !== body.origin) throw new HttpError(403, 'Origem incompatível (CSRF).');

    // Verifica PKCE S256: BASE64URL(SHA256(code_verifier)) sem passar por hex.
    if (base64url(Buffer.from(sha256Hex(body.codeVerifier), 'utf8')) !== codeRow.codeChallenge) {
      throw new HttpError(403, 'PKCE inválido (replay/CSRF).');
    }

    // Consumo atômico: só marca usado se ainda não foi e não expirou. Se 0 linhas, rejeita.
    const updated = await db
      .update(schema.authCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.authCodes.code, body.code),
          isNull(schema.authCodes.usedAt),
          gt(schema.authCodes.expiresAt, new Date()),
        ),
      );
    if ((updated.rowCount ?? 0) === 0) {
      throw new HttpError(400, 'Código já utilizado ou expirado (replay negado).');
    }

    // Papel real do usuário na organização.
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.userId, codeRow.userId),
          eq(schema.organizationMembers.organizationId, codeRow.organizationId),
        ),
      );
    if (!member) throw new HttpError(403, 'Usuário não pertence mais à organização.');
    void sql;

    const token = signSession(
      { sub: codeRow.userId, org: codeRow.organizationId, roles: [member.role], deviceId: body.deviceId, ext: true },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    const tokenHash = sha256Hex(token);
    await db.insert(schema.extensionSessions).values({
      userId: codeRow.userId,
      organizationId: codeRow.organizationId,
      deviceId: body.deviceId,
      tokenHash,
      expiresAt: new Date(Date.now() + getServerConfig().sessionTtlSeconds * 1000),
    });

    return json({ token, expiresIn: getServerConfig().sessionTtlSeconds, userId: codeRow.userId, organizationId: codeRow.organizationId, roles: [member.role] });
  } catch (e) {
    return errorResponse(e);
  }
}
