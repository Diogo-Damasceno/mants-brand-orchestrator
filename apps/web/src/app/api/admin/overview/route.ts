import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { authenticate, json, errorResponse, HttpError, isPlatformAdmin } from '@/lib/server/http';

/** Painel do administrador da plataforma (somente platform_admin). Não retorna hashes. */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await authenticate(_req);
    if (!isPlatformAdmin(ctx)) throw new HttpError(403, 'Acesso restrito.');
    const db = getDb();
    const orgs = await db.select().from(schema.organizations);
    const users = await db.select().from(schema.users);
    const subs = await db.select().from(schema.subscriptions);
    const ext = await db
      .select({
        id: schema.extensionSessions.id,
        userId: schema.extensionSessions.userId,
        organizationId: schema.extensionSessions.organizationId,
        deviceId: schema.extensionSessions.deviceId,
        status: schema.extensionSessions.status,
        createdAt: schema.extensionSessions.createdAt,
        expiresAt: schema.extensionSessions.expiresAt,
        revokedAt: schema.extensionSessions.revokedAt,
      })
      .from(schema.extensionSessions);
    return json({
      organizations: orgs.length,
      users: users.length,
      subscriptions: subs,
      extensionSessions: ext,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
