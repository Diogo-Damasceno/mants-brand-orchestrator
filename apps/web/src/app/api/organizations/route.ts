import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';
import { organizationCreateSchema } from '@mants/validation';
import { slugAvailable } from '@/lib/server/repositories';

export async function GET(_req: NextRequest) {
  try {
    const ctx = await authenticate(_req);
    const db = getDb();
    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id),
      )
      .where(eq(schema.organizationMembers.userId, ctx.userId));
    return json({ organizations: orgs });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = organizationCreateSchema.parse(await req.json());
    const db = getDb();
    let slug = body.slug;
    slug = await slugAvailable(slug);
    const orgId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.organizations).values({ id: orgId, name: body.name, slug });
      await tx.insert(schema.organizationMembers).values({
        organizationId: orgId,
        userId: ctx.userId,
        role: 'organization_owner',
        invitedBy: ctx.userId,
      });
    });
    return json({ id: orgId, slug }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
