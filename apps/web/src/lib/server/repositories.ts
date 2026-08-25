import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { RequestCtx } from './http.js';
import { hashPassword } from '@mants/auth';

/**
 * Cria organização + membro dono em uma única transação.
 * Mantida para uso em convites/criação de org adicional.
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

/**
 * Cadastro completo em UMA transação:
 * usuário -> organização -> membro -> assinatura -> contadores -> auditoria.
 * Rollback automático se qualquer etapa falhar.
 * Colisões de e-mail/slug são tratadas pelas constraints do banco (unique).
 */
export async function registerUserWithOrg(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  slug: string;
}): Promise<{ userId: string; orgId: string }> {
  const db = getDb();
  const userId = randomUUID();
  const orgId = randomUUID();
  const passwordHash = hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: userId,
      email: input.email,
      name: input.name,
      passwordHash,
    });
    await tx.insert(schema.organizations).values({
      id: orgId,
      name: input.organizationName,
      slug: input.slug,
      planTier: 'basic',
    });
    await tx.insert(schema.organizationMembers).values({
      organizationId: orgId,
      userId,
      role: 'organization_owner',
      invitedBy: userId,
    });
    await tx.insert(schema.subscriptions).values({
      id: randomUUID(),
      organizationId: orgId,
      tier: 'basic',
      provider: 'mock',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    });
    for (const metric of ['brand_kits', 'clients', 'members', 'storage_bytes', 'packages_month']) {
      await tx.insert(schema.usageCounters).values({
        id: randomUUID(),
        organizationId: orgId,
        metric,
        period: new Date().toISOString().slice(0, 7),
        count: 0,
      });
    }
    await tx.insert(schema.auditLogs).values({
      id: randomUUID(),
      organizationId: orgId,
      actorId: userId,
      action: 'register',
      entity: 'user',
      entityId: userId,
      detail: { email: input.email },
    });
  });
  return { userId, orgId };
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
