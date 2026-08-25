import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError, isPlatformAdmin } from '@/lib/server/http';
import { resultCreateSchema, approvalDecisionSchema } from '@mants/validation';
import { buildCreativePackage, type PackageAssetFile } from '@mants/creative-package';
import { COMMERCIAL_DISCLAIMERS } from '@mants/shared-types';
import { createStorage } from '@/lib/server/storage';

export async function POST_buildPackage(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const body = await req.json();
    const { brandKitId, campaignId, promptId, assetIds, summary } = body as {
      brandKitId: string;
      campaignId?: string;
      promptId: string;
      assetIds?: string[];
      summary?: string;
    };
    const db = getDb();
    const [bk] = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.id, brandKitId), eq(schema.brandKits.organizationId, ctx.organizationId)));
    if (!bk) throw new HttpError(404, 'Brand Kit não encontrado.');
    const [gp] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(and(eq(schema.generatedPrompts.id, promptId), eq(schema.generatedPrompts.organizationId, ctx.organizationId)));
    if (!gp) throw new HttpError(404, 'Prompt não encontrado.');
    const [client] = bk.clientId
      ? await db.select().from(schema.clients).where(eq(schema.clients.id, bk.clientId))
      : [null];
    const assets: PackageAssetFile[] = [];
    if (assetIds?.length) {
      const rows = await db
        .select()
        .from(schema.brandAssets)
        .where(and(eq(schema.brandAssets.organizationId, ctx.organizationId), isNull(schema.brandAssets.deletedAt)));
      for (const a of rows.filter((r) => assetIds.includes(r.id))) {
        assets.push({ path: `selected-assets/${a.originalName}`, content: Buffer.from([]), mimeType: a.mimeType });
      }
    }
    const built = await buildCreativePackage({
      organizationId: ctx.organizationId,
      organizationName: 'Organização',
      clientId: bk.clientId ?? ctx.organizationId,
      clientName: client?.name ?? 'Cliente',
      campaignId,
      campaignName: campaignId,
      creatorId: ctx.userId,
      creatorName: 'Criador',
      brandKit: {
        id: bk.id,
        name: bk.name,
        version: bk.version,
      } as never,
      prompt: {
        id: gp.id,
        originalText: gp.editedText ?? gp.originalText,
        summarizedText: summary ?? gp.editedText ?? gp.originalText,
        mode: gp.mode,
        sections: {},
        version: gp.version,
        hash: gp.promptHash,
        createdAt: new Date().toISOString(),
      },
      promptSummary: summary ?? '',
      assets,
      acceptanceText: COMMERCIAL_DISCLAIMERS.exportAcceptance,
      declaredRights: 'Direitos declarados pelo criador no momento da exportação.',
    });
    const storage = createStorage();
    const key = `packages/${ctx.organizationId}/${built.fileName}`;
    await storage.put({ key, buffer: Buffer.from(built.zip), contentType: 'application/zip' });
    const id = randomUUID();
    await db.insert(schema.creativePackages).values({
      id,
      organizationId: ctx.organizationId,
      clientId: bk.clientId,
      campaignId,
      creatorId: ctx.userId,
      fileName: built.fileName,
      storageKey: key,
      manifestJson: built.manifest as never,
      promptVersion: built.manifest.promptVersion,
      brandKitVersion: built.manifest.brandKitVersion,
      declaredRights: 'Direitos declarados pelo criador.',
      acceptanceText: COMMERCIAL_DISCLAIMERS.exportAcceptance,
    });
    return json({ id, fileName: built.fileName, manifest: built.manifest }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_results(req: NextRequest) {
  try {
    const ctx = authenticate(req);
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

export async function POST_approve(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const body = approvalDecisionSchema.parse(await req.json());
    const db = getDb();
    const [result] = await db
      .select()
      .from(schema.results)
      .where(and(eq(schema.results.id, body.resultId), eq(schema.results.organizationId, ctx.organizationId)));
    if (!result) throw new HttpError(404, 'Resultado não encontrado.');
    const id = randomUUID();
    await db.insert(schema.approvals).values({
      id,
      organizationId: ctx.organizationId,
      resultId: body.resultId,
      decision: body.decision,
      decidedBy: ctx.userId,
      comment: body.comment,
    });
    await db.update(schema.results).set({ status: body.decision === 'approved' ? 'approved' : 'changes_requested' }).where(eq(schema.results.id, body.resultId));
    return json({ id, decision: body.decision }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export { isPlatformAdmin };
