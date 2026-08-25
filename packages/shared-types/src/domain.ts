/**
 * Papéis de plataforma e organização.
 * Ordem implícita de privilégio: platform_admin > organization_owner > ...
 */
export const ROLES = [
  'platform_admin',
  'organization_owner',
  'organization_admin',
  'brand_manager',
  'designer',
  'client_reviewer',
  'viewer',
] as const;

export type Role = (typeof ROLES)[number];

/** Retorna true se `role` pode gerenciar o papel `target` em uma organização. */
export function canManageRole(role: Role, target: Role): boolean {
  const rank: Record<Role, number> = {
    platform_admin: 100,
    organization_owner: 80,
    organization_admin: 60,
    brand_manager: 40,
    designer: 30,
    client_reviewer: 20,
    viewer: 10,
  };
  return rank[role] > rank[target];
}

export const CAMPAIGN_STATUSES = [
  'draft',
  'preparing_package',
  'ready_to_use',
  'used',
  'result_received',
  'in_review',
  'changes_requested',
  'approved',
  'archived',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const PROMPT_MODES = [
  'essential',
  'professional',
  'strict_branding',
  'creative_exploration',
] as const;

export type PromptMode = (typeof PROMPT_MODES)[number];

export const PROMPT_TEMPLATE_KINDS = [
  'post_instagram',
  'story',
  'carousel',
  'banner',
  'ad',
  'promo_campaign',
  'launch',
  'institutional',
  'holiday',
  'caption',
  'copy',
  'visual_direction',
  'artwork_variation',
] as const;

export type PromptTemplateKind = (typeof PROMPT_TEMPLATE_KINDS)[number];

export const ASSET_STATUSES = ['pending', 'approved', 'rejected', 'archived'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_ORIENTATIONS = ['square', 'portrait', 'landscape', 'any'] as const;
export type AssetOrientation = (typeof ASSET_ORIENTATIONS)[number];

export const RESULT_STATUSES = ['submitted', 'in_review', 'changes_requested', 'approved'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const PLAN_TIERS = ['basic', 'professional', 'agency'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const BILLING_PROVIDERS = ['mock', 'mercadopago', 'stripe'] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const EXTENSION_SESSION_STATUSES = ['active', 'revoked', 'expired'] as const;
export type ExtensionSessionStatus = (typeof EXTENSION_SESSION_STATUSES)[number];

/** Limites de um plano (não cobra tokens). */
export interface PlanLimits {
  brandKits: number;
  users: number;
  clients: number;
  storageBytes: number;
  creativePackagesPerMonth: number;
  historyDays: number;
  customTemplates: boolean;
  versioning: boolean;
  whiteLabel: boolean;
  approvals: boolean;
}

export interface BrandColor {
  id: string;
  name: string;
  hex: string;
  rgb: string;
  cmyk?: string;
  role: 'primary' | 'secondary' | 'prohibited';
  contrast?: string;
  priority: number;
}

export interface BrandFont {
  id: string;
  family: string;
  weight: string;
  style: string;
  functionRole: 'primary' | 'secondary';
  file?: string;
  origin?: string;
  license?: string;
  commercialRightsConfirmed: boolean;
}

/** Brand Kit em formato serializável (usado no motor de prompts e pacotes). */
export interface BrandKitSnapshot {
  id: string;
  name: string;
  description?: string;
  segment?: string;
  targetAudience?: string;
  personality?: string;
  toneOfVoice?: string;
  slogan?: string;
  mission?: string;
  values?: string;
  recommendedWords?: string[];
  prohibitedWords?: string[];
  brandExpressions?: string[];
  colors: BrandColor[];
  fonts: BrandFont[];
  hierarchyRules?: string;
  approvedLogos?: string[];
  logoVariations?: string[];
  icons?: string[];
  graphicElements?: string[];
  approvedPhotos?: string[];
  references?: string[];
  approvedExamples?: string[];
  rejectedExamples?: string[];
  usageRules?: string;
  restrictions?: string;
  legalInfo?: string;
  productsAndServices?: string;
  approvedCtas?: string[];
  version: number;
}
