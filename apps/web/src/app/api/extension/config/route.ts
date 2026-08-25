import { NextRequest } from 'next/server';
import { getServerConfig } from '@mants/config';
import { json, errorResponse } from '@/lib/server/http';

/** Retorna configuração pública e feature flags para a extensão. */
export async function GET(_req: NextRequest) {
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
