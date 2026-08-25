import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { getServerConfig } from '@mants/config';

/** Valida origem contra allowlist exata (não prefixo genérico). */
export function assertAllowedOrigin(origin: string): void {
  const allowed = getServerConfig().extensionAllowedApiOrigin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) {
    throw new HttpError(403, 'Origem não autorizada.');
  }
}

/**
 * Passo 1 do fluxo PKCE da extensão.
 * Recebe code_challenge, device_id, origin. Cria um auth_code PENDENTE (sem usuário ainda).
 * O usuário fará login no site e autorizará explicitamente em /extension/authorize.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codeChallenge = String(body.codeChallenge ?? '');
    const deviceId = String(body.deviceId ?? '');
    const origin = String(body.origin ?? '');
    if (!codeChallenge || !deviceId || !origin) throw new HttpError(400, 'Parâmetros ausentes.');
    assertAllowedOrigin(origin);

    const db = getDb();
    const code = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32);
    await db.insert(schema.authCodes).values({
      code,
      codeChallenge,
      deviceId,
      origin,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
