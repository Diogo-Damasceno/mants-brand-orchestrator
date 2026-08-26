import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { buildCreativePackage, type PackageAssetFile } from '@mants/creative-package';
import { createStorage } from '@/lib/server/storage';
import { COMMERCIAL_DISCLAIMERS } from '@mants/shared-types';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.creativePackages)
      .where(eq(schema.creativePackages.organizationId, ctx.organizationId))
      .orderBy(desc(schema.creativePackages.createdAt));
    return json({ packages: rows });
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
    const body = (await req.json()) as {
      brandKitId: string;
      campaignId?: string;
      promptId: string;
      assetIds?: string[];
      summary?: string;
    };
    if (!body.brandKitId || !body.promptId) throw new HttpError(400, 'brandKitId e promptId obrigatórios.');
    const db = getDb();

    const [bk] = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.id, body.brandKitId), eq(schema.brandKits.organizationId, ctx.organizationId), isNull(schema.brandKits.deletedAt)));
    if (!bk) throw new HttpError(404, 'Brand Kit não encontrado.');

    const [gp] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(and(eq(schema.generatedPrompts.id, body.promptId), eq(schema.generatedPrompts.organizationId, ctx.organizationId)));
    if (!gp) throw new HttpError(404, 'Prompt não encontrado.');

    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.organizationId));
    const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.userId));

    const campaign = body.campaignId
      ? (await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, body.campaignId), eq(schema.campaigns.organizationId, ctx.organizationId)))).at(0) ?? null
      : null;
    const client = bk.clientId
      ? (await db.select().from(schema.clients).where(eq(schema.clients.id, bk.clientId))).at(0) ?? null
      : null;

    const colors = await db.select().from(schema.brandColors).where(eq(schema.brandColors.brandKitId, bk.id));
    const fonts = await db.select().from(schema.brandFonts).where(eq(schema.brandFonts.brandKitId, bk.id));

    const assets: PackageAssetFile[] = [];
    const storage = createStorage();
    if (body.assetIds?.length) {
      const rows = await db
        .select()
        .from(schema.brandAssets)
        .where(and(eq(schema.brandAssets.organizationId, ctx.organizationId), isNull(schema.brandAssets.deletedAt)));
      for (const a of rows.filter((r) => body.assetIds!.includes(r.id))) {
        // Não inclui ativos expirados, arquivados ou sem direitos comerciais.
        if (a.deletedAt) continue;
        if (a.expiresAt && a.expiresAt.getTime() < Date.now()) continue;
        if (!a.commercialRightsConfirmed) continue;
        const buf = await storage.get(a.storageKey);
        const ext = (a.originalName.split('.').pop() ?? 'bin').toLowerCase();
        const folder = a.mimeType.startsWith('font/')
          ? 'fonts'
          : a.mimeType.startsWith('image/')
            ? 'selected-assets'
            : 'selected-assets';
        assets.push({ path: `${folder}/${a.id}.${ext}`, content: new Uint8Array(buf), mimeType: a.mimeType });
      }
    }

    const built = await buildCreativePackage({
      organizationId: ctx.organizationId,
      organizationName: org?.name ?? 'Organização',
      clientId: client?.id ?? bk.clientId ?? ctx.organizationId,
      clientName: client?.name ?? 'Cliente',
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      creatorId: ctx.userId,
      creatorName: creator?.name ?? 'Criador',
      brandKit: {
        id: bk.id,
        name: bk.name,
        description: bk.description ?? undefined,
        segment: bk.segment ?? undefined,
        targetAudience: bk.targetAudience ?? undefined,
        personality: bk.personality ?? undefined,
        toneOfVoice: bk.toneOfVoice ?? undefined,
        slogan: bk.slogan ?? undefined,
        mission: bk.mission ?? undefined,
        values: bk.values ?? undefined,
        recommendedWords: bk.recommendedWords,
        prohibitedWords: bk.prohibitedWords,
        brandExpressions: bk.brandExpressions,
        colors: colors.map((c) => ({
          id: c.id, name: c.name, hex: c.hex, rgb: c.rgb, cmyk: c.cmyk ?? undefined,
          role: c.colorRole as 'primary' | 'secondary' | 'prohibited', contrast: c.contrast ?? undefined, priority: c.priority,
        })),
        fonts: fonts.map((f) => ({
          id: f.id, family: f.family, weight: f.weight, style: f.style,
          functionRole: f.functionRole as 'primary' | 'secondary', file: f.file ?? undefined,
          origin: f.origin ?? undefined, license: f.license ?? undefined, commercialRightsConfirmed: f.commercialRightsConfirmed,
        })),
        hierarchyRules: bk.hierarchyRules ?? undefined,
        approvedLogos: bk.approvedLogos, logoVariations: bk.logoVariations, icons: bk.icons,
        graphicElements: bk.graphicElements, approvedPhotos: bk.approvedPhotos, references: bk.references,
        approvedExamples: bk.approvedExamples, rejectedExamples: bk.rejectedExamples,
        usageRules: bk.usageRules ?? undefined, restrictions: bk.restrictions ?? undefined,
        legalInfo: bk.legalInfo ?? undefined, productsAndServices: bk.productsAndServices ?? undefined,
        approvedCtas: bk.approvedCtas, version: bk.version,
      },
      prompt: {
        id: gp.id,
        originalText: gp.editedText ?? gp.originalText,
        summarizedText: body.summary ?? gp.editedText ?? gp.originalText,
        mode: gp.mode,
        sections: {},
        version: gp.version,
        hash: gp.promptHash,
        createdAt: gp.createdAt.toISOString(),
      },
      promptSummary: body.summary ?? '',
      assets,
      acceptanceText: COMMERCIAL_DISCLAIMERS.exportAcceptance,
      declaredRights: 'Direitos declarados pelo criador no momento da exportação.',
    });

    const key = `packages/${ctx.organizationId}/${built.fileName}`;
    await storage.put({ key, buffer: Buffer.from(built.zip), contentType: 'application/zip' });

    const id = randomUUID();
    await db.insert(schema.creativePackages).values({
      id,
      organizationId: ctx.organizationId,
      clientId: bk.clientId,
      campaignId: body.campaignId,
      creatorId: ctx.userId,
      fileName: built.fileName,
      storageKey: key,
      manifestJson: built.manifest,
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
