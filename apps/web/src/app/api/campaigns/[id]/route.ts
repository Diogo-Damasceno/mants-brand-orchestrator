import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { campaignCreateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

function campId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.id, campId(req)),
          eq(schema.campaigns.organizationId, ctx.organizationId),
          isNull(schema.campaigns.deletedAt),
        ),
      );
    if (!row) throw new HttpError(404, 'Campanha não encontrada.');
    const assets = await db
      .select()
      .from(schema.brandAssets)
      .innerJoin(schema.campaignAssets, eq(schema.campaignAssets.assetId, schema.brandAssets.id))
      .where(eq(schema.campaignAssets.campaignId, row.id));
    return json({ campaign: row, assets: assets.map((a) => a.brand_assets) });
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
    const id = campId(req);
    const body = campaignCreateSchema.partial().parse(await req.json());
    const db = getDb();
    await db
      .update(schema.campaigns)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, ctx.organizationId)));
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
    const id = campId(req);
    const db = getDb();
    await db
      .update(schema.campaigns)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, ctx.organizationId)));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
