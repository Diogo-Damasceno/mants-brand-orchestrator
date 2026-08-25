import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.userId));
    const orgs = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug, role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .innerJoin(schema.organizations, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(eq(schema.organizationMembers.userId, ctx.userId));
    return json({
      user: { id: user?.id, name: user?.name, email: user?.email },
      activeOrganizationId: ctx.organizationId,
      roles: ctx.roles,
      organizations: orgs,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
