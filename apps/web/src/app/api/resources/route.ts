import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError, isPlatformAdmin } from '@/lib/server/http';
import { clientCreateSchema, brandKitCreateSchema, campaignCreateSchema } from '@mants/validation';
import { getPlanLimits } from '@/lib/server/repositories';
import { getPlan } from '@mants/billing';

export async function GET_orgs(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, ctx.userId));
    return json({ organizations: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET_clients(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.organizationId, ctx.organizationId), isNull(schema.clients.deletedAt)))
      .orderBy(schema.clients.createdAt);
    return json({ clients: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_clients(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    if (!ctx.roles.includes('organization_owner') && !ctx.roles.includes('organization_admin') && !ctx.roles.includes('brand_manager')) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const body = clientCreateSchema.parse(await req.json());
    const db = getDb();
    const id = randomUUID();
    await db.insert(schema.clients).values({ id, organizationId: ctx.organizationId, ...body });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET_brandKits(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)))
      .orderBy(schema.brandKits.createdAt);
    return json({ brandKits: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_brandKits(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const tier = await getPlanLimits(ctx);
    const plan = getPlan(tier);
    const db = getDb();
    const count = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)));
    if (count.length >= plan.limits.brandKits) {
      throw new HttpError(402, `Limite de Brand Kits do plano ${plan.name} atingido.`);
    }
    const body = brandKitCreateSchema.parse(await req.json());
    const db2 = getDb();
    const id = randomUUID();
    await db2.insert(schema.brandKits).values({ id, organizationId: ctx.organizationId, ...body });
    for (const c of body.colors) {
      await db2.insert(schema.brandColors).values({ id: randomUUID(), brandKitId: id, ...c });
    }
    for (const f of body.fonts) {
      await db2.insert(schema.brandFonts).values({ id: randomUUID(), brandKitId: id, ...f });
    }
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET_campaigns(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.organizationId, ctx.organizationId), isNull(schema.campaigns.deletedAt)))
      .orderBy(schema.campaigns.createdAt);
    return json({ campaigns: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_campaigns(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const body = campaignCreateSchema.parse(await req.json());
    const db = getDb();
    const id = randomUUID();
    await db.insert(schema.campaigns).values({ id, organizationId: ctx.organizationId, ...body });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export { isPlatformAdmin };
