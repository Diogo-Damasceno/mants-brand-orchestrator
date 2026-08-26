import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { clientCreateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

function clientId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.id, clientId(req)),
          eq(schema.clients.organizationId, ctx.organizationId),
          isNull(schema.clients.deletedAt),
        ),
      );
    if (!row) throw new HttpError(404, 'Cliente não encontrado.');
    return json({ client: row });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const id = clientId(req);
    const body = clientCreateSchema.partial().parse(await req.json());
    const db = getDb();
    const [updated] = await db
      .update(schema.clients)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.organizationId, ctx.organizationId)))
      .returning({ id: schema.clients.id });
    if (!updated) throw new HttpError(404, 'Cliente não encontrado.');
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const id = clientId(req);
    const db = getDb();
    const [deleted] = await db
      .update(schema.clients)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.organizationId, ctx.organizationId)))
      .returning({ id: schema.clients.id });
    if (!deleted) throw new HttpError(404, 'Cliente não encontrado.');
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
