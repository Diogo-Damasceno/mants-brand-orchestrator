import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { json, errorResponse } from '@/lib/server/http';
import { extensionAuthStartSchema } from '@mants/validation';
import { assertAllowedOrigin } from '@/lib/server/extension';

/**
 * Passo 1 do fluxo PKCE da extensão.
 * Recebe code_challenge, device_id, origin, state_hash, nonce_hash (SHA-256 hex 64 chars)
 * e metadados. Valida com Zod. Cria um auth_code PENDENTE (sem usuário ainda).
 * state/nonce são recebidos como HASHES — nunca armazenamos os valores em texto puro.
 */
export async function POST(req: NextRequest) {
  try {
    const body = extensionAuthStartSchema.parse(await req.json());
    assertAllowedOrigin(body.origin);

    const db = getDb();
    const code = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32);
    await db.insert(schema.authCodes).values({
      code,
      codeChallenge: body.codeChallenge,
      deviceId: body.deviceId,
      origin: body.origin,
      stateHash: body.stateHash,
      nonceHash: body.nonceHash,
      cancelSecretHash: body.cancelSecretHash,
      browser: body.browser,
      extensionVersion: body.extensionVersion,
      extensionName: body.extensionName,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
