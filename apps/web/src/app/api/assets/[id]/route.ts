import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { assetStatusUpdateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

function assetId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.brandAssets)
      .where(
        and(
          eq(schema.brandAssets.id, assetId(req)),
          eq(schema.brandAssets.organizationId, ctx.organizationId),
          isNull(schema.brandAssets.deletedAt),
        ),
      );
    if (!row) throw new HttpError(404, 'Ativo não encontrado.');
    return json({ asset: row });
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
    const id = assetId(req);
    const body = assetStatusUpdateSchema.partial().parse(await req.json());
    const db = getDb();
    await db
      .update(schema.brandAssets)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.organizationId, ctx.organizationId)));
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
    const id = assetId(req);
    const db = getDb();
    await db
      .update(schema.brandAssets)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.organizationId, ctx.organizationId)));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
