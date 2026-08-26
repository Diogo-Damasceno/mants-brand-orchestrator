import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { brandKitCreateSchema } from '@mants/validation';
import { getPlanLimits } from '@/lib/server/repositories';
import { getPlan } from '@mants/billing';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)))
      .orderBy(desc(schema.brandKits.createdAt));
    return json({ brandKits: rows });
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
    const id = randomUUID();
    await db.insert(schema.brandKits).values({ id, organizationId: ctx.organizationId, version: 1, ...body });
    for (const c of body.colors ?? []) {
      await db.insert(schema.brandColors).values({
        id: randomUUID(),
        brandKitId: id,
        name: c.name,
        hex: c.hex,
        rgb: c.rgb,
        cmyk: c.cmyk ?? null,
        colorRole: c.role,
        contrast: c.contrast ?? null,
        priority: c.priority,
      });
    }
    for (const f of body.fonts ?? []) {
      await db.insert(schema.brandFonts).values({
        id: randomUUID(),
        brandKitId: id,
        family: f.family,
        weight: f.weight,
        style: f.style,
        functionRole: f.functionRole,
        file: f.file ?? null,
        origin: f.origin ?? null,
        license: f.license ?? null,
        commercialRightsConfirmed: f.commercialRightsConfirmed,
      });
    }
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
