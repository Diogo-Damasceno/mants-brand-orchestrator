import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { json, errorResponse } from '@/lib/server/http';
import { getServerConfig } from '@mants/config';
import { sha256Hex } from '@mants/auth';

/** Revoga a sessão da extensão (logout). */
export async function POST_revoke(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace('Bearer ', '');
    const tokenHash = sha256Hex(token);
    const db = getDb();
    await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(schema.extensionSessions.tokenHash, tokenHash));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Retorna configuração pública e feature flags para a extensão. */
export async function GET_config(_req: NextRequest) {
  try {
    const cfg = getServerConfig();
    return json({
      featureChatgptAssistedInsertion: cfg.featureChatgptAssistedInsertion,
      extensionAllowedApiOrigin: cfg.extensionAllowedApiOrigin,
      extensionMinVersion: cfg.extensionMinVersion,
      appUrl: cfg.appUrl,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
