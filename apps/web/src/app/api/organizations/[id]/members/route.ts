import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { canManage } from '@/lib/server/authz';
import type { Role } from '@mants/shared-types';

function orgIdFromPath(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  // /api/organizations/[id]/members
  return parts[3]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const orgId = orgIdFromPath(req);
    if (ctx.organizationId !== orgId && !ctx.roles.includes('platform_admin')) {
      throw new HttpError(403, 'Acesso negado.');
    }
    const db = getDb();
    const members = await db
      .select({
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, orgId));
    return json({ members });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const orgId = orgIdFromPath(req);
    if (ctx.organizationId !== orgId && !ctx.roles.includes('platform_admin')) {
      throw new HttpError(403, 'Acesso negado.');
    }
    if (!canManage(ctx, 'organization_admin')) {
      throw new HttpError(403, 'Sem permissão para convidar membros.');
    }
    const body = (await req.json()) as { email?: string; role?: Role };
    if (!body.email || !body.role) throw new HttpError(400, 'email e role obrigatórios.');
    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, body.email.toLowerCase()));
    if (!user) throw new HttpError(404, 'Usuário não encontrado com este e-mail.');
    // Se já for membro, atualiza papel; senão insere.
    const [existing] = await db
      .select()
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id),
        ),
      );
    if (existing) {
      await db
        .update(schema.organizationMembers)
        .set({ role: body.role })
        .where(
          and(
            eq(schema.organizationMembers.organizationId, orgId),
            eq(schema.organizationMembers.userId, user.id),
          ),
        );
    } else {
      await db.insert(schema.organizationMembers).values({
        organizationId: orgId,
        userId: user.id,
        role: body.role,
        invitedBy: ctx.userId,
      });
    }
    return json({ ok: true, userId: user.id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
