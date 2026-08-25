import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { assertAllowedOrigin } from '@/lib/server/extension';

/**
 * Passo 1 do fluxo PKCE da extensão.
 * Recebe code_challenge, device_id, origin, state_hash, nonce_hash e metadados.
 * Cria um auth_code PENDENTE (sem usuário ainda) para o fluxo de autorização.
 * state/nonce são recebidos como HASHES — nunca armazenamos os valores em texto puro.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codeChallenge = String(body.codeChallenge ?? '');
    const deviceId = String(body.deviceId ?? '');
    const origin = String(body.origin ?? '');
    if (!codeChallenge || !deviceId || !origin) throw new HttpError(400, 'Parâmetros ausentes.');
    assertAllowedOrigin(origin);

    const stateHash = body.stateHash ? String(body.stateHash) : undefined;
    const nonceHash = body.nonceHash ? String(body.nonceHash) : undefined;
    const browser = body.browser ? String(body.browser) : undefined;
    const extensionVersion = body.extensionVersion ? String(body.extensionVersion) : undefined;
    const extensionName = body.extensionName ? String(body.extensionName) : 'Mants Brand Orchestrator';

    const db = getDb();
    const code = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32);
    await db.insert(schema.authCodes).values({
      code,
      codeChallenge,
      deviceId,
      origin,
      stateHash,
      nonceHash,
      browser,
      extensionVersion,
      extensionName,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}

