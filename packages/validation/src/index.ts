import { z } from 'zod';
import {
  ROLES,
  CAMPAIGN_STATUSES,
  PROMPT_MODES,
  PROMPT_TEMPLATE_KINDS,
  ASSET_STATUSES,
  ASSET_ORIENTATIONS,
  RESULT_STATUSES,
  PLAN_TIERS,
} from '@mants/shared-types';

const uuid = z.string().uuid();

export const roleSchema = z.enum(ROLES);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const promptModeSchema = z.enum(PROMPT_MODES);
export const promptTemplateKindSchema = z.enum(PROMPT_TEMPLATE_KINDS);
export const assetStatusSchema = z.enum(ASSET_STATUSES);
export const assetOrientationSchema = z.enum(ASSET_ORIENTATIONS);
export const resultStatusSchema = z.enum(RESULT_STATUSES);
export const planTierSchema = z.enum(PLAN_TIERS);

// ----- Auth -----
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  name: z.string().min(2).max(120),
  organizationName: z.string().min(2).max(160),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const extensionCodeExchangeSchema = z.object({
  code: z.string().min(16).max(128),
  codeVerifier: z.string().min(16).max(256),
  deviceId: z.string().min(4).max(128),
  origin: z.string().url(),
});
export type ExtensionCodeExchangeInput = z.infer<typeof extensionCodeExchangeSchema>;

// ----- Organization / Client -----
export const organizationCreateSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
});
export const clientCreateSchema = z.object({
  name: z.string().min(2).max(160),
  industry: z.string().max(120).optional(),
  website: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

// ----- Brand Kit -----
export const brandColorSchema = z.object({
  name: z.string().min(1).max(60),
  hex: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  rgb: z.string().regex(/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/),
  cmyk: z.string().optional(),
  role: z.enum(['primary', 'secondary', 'prohibited']),
  contrast: z.string().optional(),
  priority: z.number().int().min(0).max(100),
});
export const brandFontSchema = z.object({
  family: z.string().min(1).max(120),
  weight: z.string().max(40),
  style: z.string().max(40),
  functionRole: z.enum(['primary', 'secondary']),
  file: z.string().optional(),
  origin: z.string().max(200).optional(),
  license: z.string().max(200).optional(),
  commercialRightsConfirmed: z.boolean(),
});
export const brandKitCreateSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  segment: z.string().max(120).optional(),
  targetAudience: z.string().max(1000).optional(),
  personality: z.string().max(1000).optional(),
  toneOfVoice: z.string().max(1000).optional(),
  slogan: z.string().max(200).optional(),
  mission: z.string().max(2000).optional(),
  values: z.string().max(2000).optional(),
  recommendedWords: z.array(z.string()).max(100),
  prohibitedWords: z.array(z.string()).max(100),
  brandExpressions: z.array(z.string()).max(100),
  colors: z.array(brandColorSchema).max(40),
  fonts: z.array(brandFontSchema).max(40),
  hierarchyRules: z.string().max(2000).optional(),
  approvedLogos: z.array(z.string()).max(20),
  logoVariations: z.array(z.string()).max(20),
  icons: z.array(z.string()).max(40),
  graphicElements: z.array(z.string()).max(40),
  approvedPhotos: z.array(z.string()).max(40),
  references: z.array(z.string()).max(40),
  approvedExamples: z.array(z.string()).max(40),
  rejectedExamples: z.array(z.string()).max(40),
  usageRules: z.string().max(2000).optional(),
  restrictions: z.string().max(2000).optional(),
  legalInfo: z.string().max(2000).optional(),
  productsAndServices: z.string().max(2000).optional(),
  approvedCtas: z.array(z.string()).max(40),
});

// ----- Campaign -----
export const campaignCreateSchema = z.object({
  name: z.string().min(2).max(160),
  clientId: uuid,
  brandKitId: uuid.optional(),
  objective: z.string().max(1000).optional(),
  productOrService: z.string().max(1000).optional(),
  audience: z.string().max(1000).optional(),
  channel: z.string().max(120).optional(),
  format: z.string().max(120).optional(),
  dimensions: z.string().max(60).optional(),
  offer: z.string().max(1000).optional(),
  cta: z.string().max(500).optional(),
  date: z.string().max(60).optional(),
  tone: z.string().max(200).optional(),
  mandatoryContent: z.array(z.string()).max(40),
  prohibitedContent: z.array(z.string()).max(40),
  references: z.array(z.string()).max(40),
  selectedAssetIds: z.array(uuid).max(100),
  promptMode: promptModeSchema,
  variations: z.number().int().min(1).max(20),
});
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

// ----- Assets -----
export const assetStatusUpdateSchema = z.object({
  status: assetStatusSchema,
});
export const assetUploadMetaSchema = z.object({
  originalName: z.string().max(255),
  mimeType: z.string().max(120),
  orientation: assetOrientationSchema.optional(),
  tags: z.array(z.string()).max(50),
  productIds: z.array(uuid).max(50),
  campaignIds: z.array(uuid).max(50),
  brandKitId: uuid.optional(),
  commercialRightsConfirmed: z.boolean(),
  predominantColorHex: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional(),
  expiresAt: z.string().datetime().optional(),
});

// ----- Prompt generation -----
export const promptGenerateSchema = z.object({
  brandKitId: uuid,
  campaignId: uuid.optional(),
  templateId: uuid.optional(),
  promptMode: promptModeSchema,
  objective: z.string().max(1000).optional(),
  productOrService: z.string().max(1000).optional(),
  audience: z.string().max(1000).optional(),
  offer: z.string().max(1000).optional(),
  cta: z.string().max(500).optional(),
  mandatoryContent: z.array(z.string()).max(40),
  prohibitedContent: z.array(z.string()).max(40),
  selectedAssetIds: z.array(uuid).max(100),
  variations: z.number().int().min(1).max(20),
});
export type PromptGenerateInput = z.infer<typeof promptGenerateSchema>;

export const promptEditSchema = z.object({
  promptId: uuid,
  editedText: z.string().min(1).max(20000),
});
export type PromptEditInput = z.infer<typeof promptEditSchema>;

// ----- Results / Approvals -----
export const resultCreateSchema = z.object({
  campaignId: uuid,
  promptId: uuid.optional(),
  packageId: uuid.optional(),
  status: resultStatusSchema,
  textContent: z.string().max(20000).optional(),
  notes: z.string().max(2000).optional(),
  version: z.number().int().min(1),
});
export type ResultCreateInput = z.infer<typeof resultCreateSchema>;

export const approvalDecisionSchema = z.object({
  resultId: uuid,
  decision: z.enum(['approved', 'changes_requested']),
  comment: z.string().max(2000).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

// ----- Extension session -----
export const extensionSessionCreateSchema = z.object({
  deviceId: z.string().min(4).max(128),
  userAgent: z.string().max(300),
});

// ----- Legal acceptance -----
export const legalAcceptanceSchema = z.object({
  termsVersion: z.string().max(40),
  privacyVersion: z.string().max(40),
  accepted: z.literal(true),
});
