import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { brandKitCreateSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

function bkId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [bk] = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.id, bkId(req)), eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)));
    if (!bk) throw new HttpError(404, 'Brand Kit não encontrado.');
    const colors = await db.select().from(schema.brandColors).where(eq(schema.brandColors.brandKitId, bk.id));
    const fonts = await db.select().from(schema.brandFonts).where(eq(schema.brandFonts.brandKitId, bk.id));
    const rules = await db.select().from(schema.brandRules).where(eq(schema.brandRules.brandKitId, bk.id));
    return json({ brandKit: { ...bk, colors, fonts, rules } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const id = bkId(req);
    const body = brandKitCreateSchema.partial().parse(await req.json());
    const db = getDb();
    const [current] = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.id, id), eq(schema.brandKits.organizationId, ctx.organizationId)));
    if (!current) throw new HttpError(404, 'Brand Kit não encontrado.');
    const { colors, fonts, rules, ...rest } = body as typeof body & {
      colors?: unknown[];
      fonts?: unknown[];
      rules?: unknown[];
    };
    await db
      .update(schema.brandKits)
      .set({ ...rest, version: current.version + 1, updatedAt: new Date() })
      .where(eq(schema.brandKits.id, id));
    // Versionamento: snapshot da versão anterior.
    await db.insert(schema.brandKitVersions).values({
      id: randomUUID(),
      brandKitId: id,
      version: current.version,
      snapshot: current as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    });
    if (colors) {
      await db.delete(schema.brandColors).where(eq(schema.brandColors.brandKitId, id));
      for (const c of colors) await db.insert(schema.brandColors).values({ id: randomUUID(), brandKitId: id, ...(c as Record<string, unknown>) } as never);
    }
    if (fonts) {
      await db.delete(schema.brandFonts).where(eq(schema.brandFonts.brandKitId, id));
      for (const f of fonts) await db.insert(schema.brandFonts).values({ id: randomUUID(), brandKitId: id, ...(f as Record<string, unknown>) } as never);
    }
    if (rules) {
      await db.delete(schema.brandRules).where(eq(schema.brandRules.brandKitId, id));
      for (const r of rules) await db.insert(schema.brandRules).values({ id: randomUUID(), brandKitId: id, ...(r as Record<string, unknown>) } as never);
    }
    return json({ ok: true, version: current.version + 1 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const id = bkId(req);
    const db = getDb();
    await db
      .update(schema.brandKits)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.brandKits.id, id), eq(schema.brandKits.organizationId, ctx.organizationId)));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
