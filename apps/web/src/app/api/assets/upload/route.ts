import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { createStorage, validateUpload, sha256Hex, sanitizeSvg, detectMime } from '@/lib/server/storage';
import { getPlanLimits } from '@/lib/server/repositories';
import { getPlan } from '@mants/billing';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Arquivo ausente.');
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validação por magic bytes (não confia no MIME do navegador).
    const realMime = detectMime(buffer);
    if (!realMime) throw new HttpError(400, 'Tipo de arquivo não reconhecido ou não suportado.');
    validateUpload(realMime, buffer.byteLength);

    let content = buffer;
    if (realMime === 'image/svg+xml') {
      content = Buffer.from(await sanitizeSvg(buffer.toString('utf8')), 'utf8');
    }

    // Limite de storage por plano (contagem transacional via SUM).
    const tier = await getPlanLimits(ctx);
    const plan = getPlan(tier);
    const db = getDb();
    const [agg] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.brandAssets.sizeBytes}), 0)` })
      .from(schema.brandAssets)
      .where(and(eq(schema.brandAssets.organizationId, ctx.organizationId), isNull(schema.brandAssets.deletedAt)));
    if ((agg?.total ?? 0) + content.byteLength > plan.limits.storageBytes) {
      throw new HttpError(402, 'Limite de armazenamento do plano atingido.');
    }

    const metaRaw = form.get('meta');
    let meta: Record<string, unknown> = {};
    if (typeof metaRaw === 'string') {
      try {
        meta = JSON.parse(metaRaw);
      } catch {
        meta = {};
      }
    }
    const originalName = (meta.originalName as string) || file.name;
    const key = `assets/${ctx.organizationId}/${randomUUID()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storage = createStorage();
    const { size } = await storage.put({ key, buffer: content, contentType: realMime });

    const id = randomUUID();
    await db.insert(schema.brandAssets).values({
      id,
      organizationId: ctx.organizationId,
      clientId: (meta.clientId as string) || null,
      brandKitId: (meta.brandKitId as string) || null,
      storageKey: key,
      originalName: originalName.slice(0, 255),
      mimeType: realMime,
      sizeBytes: size,
      orientation: ((meta.orientation as string) || 'any') as 'square' | 'portrait' | 'landscape' | 'any',
      status: 'pending',
      license: (meta.license as string) || null,
      commercialRightsConfirmed: Boolean(meta.commercialRightsConfirmed),
      expiresAt: meta.expiresAt ? new Date(meta.expiresAt as string) : null,
      assetHash: sha256Hex(content),
      version: 1,
      uploadedBy: ctx.userId,
    });
    return json({ id, key, size, mimeType: realMime }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
