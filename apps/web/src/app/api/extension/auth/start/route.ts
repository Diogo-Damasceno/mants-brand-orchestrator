import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { assertAllowedOrigin } from '@/lib/server/extension';
import { extensionCodeStartSchema } from '@mants/validation';

/**
 * Passo 1 do fluxo PKCE da extensão.
 * Recebe code_challenge, device_id, origin, HASHES de state/nonce.
 * Cria um auth_code PENDENTE (sem usuário ainda).
 * O usuário fará login no site e autorizará explicitamente em /extension/authorize.
 * state/nonce em RAW nunca saem do dispositivo; o backend só guarda os hashes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = extensionCodeStartSchema.parse(await req.json());
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
      browser: body.browser ?? 'Desconhecido',
      extensionVersion: body.extensionVersion,
      extensionName: body.extensionName ?? 'Mants Brand Orchestrator',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
