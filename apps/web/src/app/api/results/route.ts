import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, desc } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { resultCreateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.results)
      .where(eq(schema.results.organizationId, ctx.organizationId))
      .orderBy(desc(schema.results.createdAt));
    return json({ results: rows });
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
    const body = resultCreateSchema.parse(await req.json());
    const db = getDb();
    const id = randomUUID();
    await db.insert(schema.results).values({
      id,
      organizationId: ctx.organizationId,
      campaignId: body.campaignId,
      promptId: body.promptId,
      packageId: body.packageId,
      status: body.status,
      textContent: body.textContent,
      notes: body.notes,
      version: body.version,
      createdBy: ctx.userId,
    });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
