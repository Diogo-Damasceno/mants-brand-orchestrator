import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { signSession } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { setSessionCookie } from '@/lib/server/session';

/** Alterna a organização ativa da sessão web (re-emite cookie com o novo org). */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const { organizationId } = (await req.json()) as { organizationId?: string };
    if (!organizationId) throw new HttpError(400, 'organizationId ausente.');
    const db = getDb();
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, ctx.userId),
        ),
      );
    if (!member) throw new HttpError(403, 'Você não pertence a esta organização.');
    const token = signSession(
      { sub: ctx.userId, org: organizationId, roles: [member.role] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    const res = json({ ok: true, organizationId, roles: [member.role] });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const id = req.nextUrl.pathname.split('/').pop()!;
    const db = getDb();
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(and(eq(schema.organizations.id, id), isNull(schema.organizations.deletedAt)));
    if (!org) throw new HttpError(404, 'Organização não encontrada.');
    void sql;
    return json({ organization: org });
  } catch (e) {
    return errorResponse(e);
  }
}
