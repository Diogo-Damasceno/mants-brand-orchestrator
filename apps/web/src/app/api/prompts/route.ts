import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { promptGenerateSchema, promptEditSchema } from '@mants/validation';
import { generatePrompt } from '@mants/prompt-engine';
import { sha256Sync } from '@mants/prompt-engine/hash';

export async function POST_generate(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const body = promptGenerateSchema.parse(await req.json());
    const db = getDb();
    const [bk] = await db
      .select()
      .from(schema.brandKits)
      .where(and(eq(schema.brandKits.id, body.brandKitId), eq(schema.brandKits.organizationId, ctx.organizationId)));
    if (!bk) throw new HttpError(404, 'Brand Kit não encontrado nesta organização.');
    const colors = await db.select().from(schema.brandColors).where(eq(schema.brandColors.brandKitId, bk.id));
    const fonts = await db.select().from(schema.brandFonts).where(eq(schema.brandFonts.brandKitId, bk.id));
    const assets = body.selectedAssetIds.length
      ? await db
          .select()
          .from(schema.brandAssets)
          .where(and(eq(schema.brandAssets.organizationId, ctx.organizationId), isNull(schema.brandAssets.deletedAt)))
      : [];
    const selectedAssets = assets
      .filter((a) => body.selectedAssetIds.includes(a.id))
      .map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        status: a.status,
        commercialRightsConfirmed: a.commercialRightsConfirmed,
        tags: [] as string[],
        productIds: [] as string[],
        campaignIds: [] as string[],
        archived: false,
      }));
    const prompt = await generatePrompt({
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
          id: c.id,
          name: c.name,
          hex: c.hex,
          rgb: c.rgb,
          cmyk: c.cmyk ?? undefined,
          role: c.colorRole as 'primary' | 'secondary' | 'prohibited',
          contrast: c.contrast ?? undefined,
          priority: c.priority,
        })),
        fonts: fonts.map((f) => ({
          id: f.id,
          family: f.family,
          weight: f.weight,
          style: f.style,
          functionRole: f.functionRole as 'primary' | 'secondary',
          file: f.file ?? undefined,
          origin: f.origin ?? undefined,
          license: f.license ?? undefined,
          commercialRightsConfirmed: f.commercialRightsConfirmed,
        })),
        hierarchyRules: bk.hierarchyRules ?? undefined,
        approvedLogos: bk.approvedLogos,
        logoVariations: bk.logoVariations,
        icons: bk.icons,
        graphicElements: bk.graphicElements,
        approvedPhotos: bk.approvedPhotos,
        references: bk.references,
        approvedExamples: bk.approvedExamples,
        rejectedExamples: bk.rejectedExamples,
        usageRules: bk.usageRules ?? undefined,
        restrictions: bk.restrictions ?? undefined,
        legalInfo: bk.legalInfo ?? undefined,
        productsAndServices: bk.productsAndServices ?? undefined,
        approvedCtas: bk.approvedCtas,
        version: bk.version,
      },
      templateKind: 'post_instagram',
      mode: body.promptMode,
      campaign: {
        objective: body.objective,
        productOrService: body.productOrService,
        audience: body.audience,
        offer: body.offer,
        cta: body.cta,
        mandatoryContent: body.mandatoryContent,
        prohibitedContent: body.prohibitedContent,
      },
      selectedAssets,
      variations: body.variations,
      creatorId: ctx.userId,
      createdBy: ctx.userId,
    });
    const id = randomUUID();
    await db.insert(schema.generatedPrompts).values({
      id,
      organizationId: ctx.organizationId,
      brandKitId: bk.id,
      brandKitVersion: bk.version,
      campaignId: body.campaignId,
      mode: body.promptMode,
      originalText: prompt.originalText,
      version: 1,
      promptHash: sha256Sync(prompt.originalText),
      createdBy: ctx.userId,
    });
    return json({ id, prompt: { ...prompt, id } }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_edit(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const body = promptEditSchema.parse(await req.json());
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(
        and(eq(schema.generatedPrompts.id, body.promptId), eq(schema.generatedPrompts.organizationId, ctx.organizationId)),
      );
    if (!row) throw new HttpError(404, 'Prompt não encontrado.');
    await db
      .update(schema.generatedPrompts)
      .set({ editedText: body.editedText, editedBy: ctx.userId, editedAt: new Date() })
      .where(eq(schema.generatedPrompts.id, body.promptId));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
