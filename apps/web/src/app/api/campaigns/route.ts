import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { campaignCreateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const brandKitId = req.nextUrl.searchParams.get('brandKitId');
    const where = and(
      eq(schema.campaigns.organizationId, ctx.organizationId),
      isNull(schema.campaigns.deletedAt),
      brandKitId ? eq(schema.campaigns.brandKitId, brandKitId) : undefined,
    );
    const rows = await db
      .select()
      .from(schema.campaigns)
      .where(where)
      .orderBy(desc(schema.campaigns.createdAt));
    return json({ campaigns: rows });
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
    const body = campaignCreateSchema.parse(await req.json());
    const db = getDb();
    const id = randomUUID();
    await db.insert(schema.campaigns).values({ id, organizationId: ctx.organizationId, ...body });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
