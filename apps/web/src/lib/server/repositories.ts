import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { RequestCtx } from './http.js';

export async function createOrganizationWithOwner(input: {
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
}): Promise<string> {
  const db = getDb();
  const orgId = randomUUID();
  await db.insert(schema.organizations).values({
    id: orgId,
    name: input.name,
    slug: input.slug,
    planTier: 'basic',
  });
  await db.insert(schema.organizationMembers).values({
    organizationId: orgId,
    userId: input.ownerId,
    role: 'organization_owner',
    invitedBy: input.ownerId,
  });
  return orgId;
}

export async function listClients(ctx: RequestCtx) {
  const db = getDb();
  return db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, ctx.organizationId), isNull(schema.clients.deletedAt)))
    .orderBy(desc(schema.clients.createdAt));
}

export async function createClient(
  ctx: RequestCtx,
  values: Omit<typeof schema.clients.$inferInsert, 'organizationId'>,
) {
  const db = getDb();
  const id = randomUUID();
  await db.insert(schema.clients).values({ id, ...values, organizationId: ctx.organizationId });
  return id;
}

export async function listBrandKits(ctx: RequestCtx) {
  const db = getDb();
  return db
    .select()
    .from(schema.brandKits)
    .where(
      and(eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)),
    )
    .orderBy(desc(schema.brandKits.createdAt));
}

export async function listCampaigns(ctx: RequestCtx) {
  const db = getDb();
  return db
    .select()
    .from(schema.campaigns)
    .where(
      and(eq(schema.campaigns.organizationId, ctx.organizationId), isNull(schema.campaigns.deletedAt)),
    )
    .orderBy(desc(schema.campaigns.createdAt));
}

export async function getPlanLimits(ctx: RequestCtx) {
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.organizationId));
  return org?.planTier ?? 'basic';
}
