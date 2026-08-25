import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { extensionCodeExchangeSchema } from '@mants/validation';
import { signSession, sha256Hex, base64url } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { assertAllowedOrigin } from '../start/route';

/**
 * Passo 3 do fluxo PKCE (extensão).
 * Verifica PKCE (S256), origem allowlist, código único vinculado a usuário real,
 * consome o código atomicamente e emite sessão curta da extensão.
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
    const uid: string = codeRow.userId;
    const oid: string = codeRow.organizationId;
    if (codeRow.origin !== body.origin) throw new HttpError(403, 'Origem incompatível (CSRF).');

    // Verifica PKCE S256: code_challenge == SHA256(code_verifier) em base64url.
    if (base64url(Buffer.from(sha256Hex(body.codeVerifier), 'utf8')) !== codeRow.codeChallenge) {
      throw new HttpError(403, 'PKCE inválido (replay/CSRF).');
    }

    // Consumo atômico + criação da sessão de extensão na mesma transação.
    const token = signSession(
      {
        sub: codeRow.userId,
        org: codeRow.organizationId,
        roles: ['organization_owner'],
        deviceId: body.deviceId,
        ext: true,
      },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    const tokenHash = sha256Hex(token);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.authCodes)
        .set({ usedAt: new Date() })
        .where(eq(schema.authCodes.code, body.code));
      await tx.insert(schema.extensionSessions).values({
        userId: uid,
        organizationId: oid,
        deviceId: body.deviceId,
        tokenHash,
        expiresAt: new Date(Date.now() + getServerConfig().sessionTtlSeconds * 1000),
      });
    });

    return json({ token, expiresIn: getServerConfig().sessionTtlSeconds });
  } catch (e) {
    return errorResponse(e);
  }
}
