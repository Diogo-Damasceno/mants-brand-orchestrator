import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { RequestCtx } from './http.js';

/**
 * Cria organização + membro dono em uma única transação.
 * O usuário já deve existir (criado antes da chamada).
 * Rollback automático em caso de falha.
 */
export async function createOrganizationWithOwner(input: {
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
}): Promise<string> {
  const db = getDb();
  const orgId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.organizations).values({
      id: orgId,
      name: input.name,
      slug: input.slug,
      planTier: 'basic',
    });
    await tx.insert(schema.organizationMembers).values({
      organizationId: orgId,
      userId: input.ownerId,
      role: 'organization_owner',
      invitedBy: input.ownerId,
    });
    // Assinatura básica inicial.
    await tx.insert(schema.subscriptions).values({
      id: randomUUID(),
      organizationId: orgId,
      tier: 'basic',
      provider: 'mock',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    });
  });
  return orgId;
}

/** Verifica disponibilidade de slug e acrescenta sufixo seguro em caso de colisão. */
export async function slugAvailable(base: string): Promise<string> {
  const db = getDb();
  let candidate = base;
  for (let i = 1; i <= 20; i++) {
    const [existing] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, candidate));
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
  // Fallback com UUID para garantir unicidade.
  return `${base}-${randomUUID().slice(0, 8)}`;
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
