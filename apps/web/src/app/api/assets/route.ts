import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc, like, or } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const tag = req.nextUrl.searchParams.get('tag');
    const statusParam = req.nextUrl.searchParams.get('status');
    const brandKitId = req.nextUrl.searchParams.get('brandKitId');
    const allowedStatus = ['pending', 'approved', 'rejected', 'archived'] as const;
    type AssetStatus = (typeof allowedStatus)[number];
    const status: AssetStatus | undefined =
      statusParam && (allowedStatus as readonly string[]).includes(statusParam)
        ? (statusParam as AssetStatus)
        : undefined;
    const where = and(
      eq(schema.brandAssets.organizationId, ctx.organizationId),
      isNull(schema.brandAssets.deletedAt),
      status ? eq(schema.brandAssets.status, status) : undefined,
      brandKitId ? eq(schema.brandAssets.brandKitId, brandKitId) : undefined,
      tag ? or(like(schema.brandAssets.originalName, `%${tag}%`)) : undefined,
    );
    const rows = await db
      .select()
      .from(schema.brandAssets)
      .where(where)
      .orderBy(desc(schema.brandAssets.createdAt))
      .limit(200);
    return json({ assets: rows });
  } catch (e) {
    return errorResponse(e);
  }
}
