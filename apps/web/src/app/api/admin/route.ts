import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse, isPlatformAdmin, HttpError } from '@/lib/server/http';

/** Painel do administrador da plataforma (somente platform_admin). */
export async function GET_adminOverview(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    if (!isPlatformAdmin(ctx)) throw new HttpError(403, 'Acesso restrito.');
    const db = getDb();
    const orgs = await db.select().from(schema.organizations);
    const users = await db.select().from(schema.users);
    const subs = await db.select().from(schema.subscriptions);
    const ext = await db.select().from(schema.extensionSessions);
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

/** Revoga todas as sessões de extensão de um usuário (procedimento de incidente). */
export async function POST_adminRevokeExtension(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    if (!isPlatformAdmin(ctx)) throw new HttpError(403, 'Acesso restrito.');
    const { userId } = (await req.json()) as { userId?: string };
    const db = getDb();
    await db
      .update(schema.extensionSessions)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(schema.extensionSessions.userId, userId ?? ctx.userId));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
