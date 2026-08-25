import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc, like, or } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { clientCreateSchema } from '@mants/validation';
import { getPlanLimits } from '@/lib/server/repositories';
import { getPlan } from '@mants/billing';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const search = req.nextUrl.searchParams.get('search')?.trim();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'));
    const pageSize = 50;
    const where = search
      ? and(
          eq(schema.clients.organizationId, ctx.organizationId),
          isNull(schema.clients.deletedAt),
          or(
            like(schema.clients.name, `%${search}%`),
            like(schema.clients.industry ?? '', `%${search}%`),
          ),
        )
      : and(eq(schema.clients.organizationId, ctx.organizationId), isNull(schema.clients.deletedAt));
    const rows = await db
      .select()
      .from(schema.clients)
      .where(where)
      .orderBy(desc(schema.clients.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return json({ clients: rows, page, pageSize });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    // Limite de clientes por plano.
    const tier = await getPlanLimits(ctx);
    const plan = getPlan(tier);
    const db = getDb();
    const count = await db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.organizationId, ctx.organizationId), isNull(schema.clients.deletedAt)));
    if (count.length >= plan.limits.clients) {
      throw new HttpError(402, `Limite de clientes do plano ${plan.name} atingido.`);
    }
    const body = clientCreateSchema.parse(await req.json());
    const id = randomUUID();
    await db.insert(schema.clients).values({ id, organizationId: ctx.organizationId, ...body });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
