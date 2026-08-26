import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
export const roleEnum = pgEnum('role', [
  'platform_admin',
  'organization_owner',
  'organization_admin',
  'brand_manager',
  'designer',
  'client_reviewer',
  'viewer',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'preparing_package',
  'ready_to_use',
  'used',
  'result_received',
  'in_review',
  'changes_requested',
  'approved',
  'archived',
]);

export const promptModeEnum = pgEnum('prompt_mode', [
  'essential',
  'professional',
  'strict_branding',
  'creative_exploration',
]);

export const promptTemplateKindEnum = pgEnum('prompt_template_kind', [
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
]);

export const assetStatusEnum = pgEnum('asset_status', ['pending', 'approved', 'rejected', 'archived']);
export const assetOrientationEnum = pgEnum('asset_orientation', [
  'square',
  'portrait',
  'landscape',
  'any',
]);
export const resultStatusEnum = pgEnum('result_status', [
  'submitted',
  'in_review',
  'changes_requested',
  'approved',
]);
export const planTierEnum = pgEnum('plan_tier', ['basic', 'professional', 'agency']);
export const billingProviderEnum = pgEnum('billing_provider', ['mock', 'mercadopago', 'stripe']);
export const extSessionStatusEnum = pgEnum('ext_session_status', ['active', 'revoked', 'expired']);

// ---------- Users ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ---------- Organizations ----------
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  planTier: planTierEnum('plan_tier').notNull().default('basic'),
  billingProvider: billingProviderEnum('billing_provider').notNull().default('mock'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    invitedBy: uuid('invited_by'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.userId] }) }),
);

// ---------- Extension sessions ----------
export const extensionSessions = pgTable('extension_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  deviceId: varchar('device_id', { length: 128 }).notNull(),
  tokenHash: text('token_hash').notNull(),
  status: extSessionStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const authCodes = pgTable('auth_codes', {
  code: varchar('code', { length: 128 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  codeChallenge: text('code_challenge').notNull(),
  deviceId: varchar('device_id', { length: 128 }).notNull(),
  origin: text('origin').notNull(),
  extensionName: varchar('extension_name', { length: 160 }).notNull().default('Mants Brand Orchestrator'),
  browser: varchar('browser', { length: 80 }),
  extensionVersion: varchar('extension_version', { length: 40 }),
  stateHash: varchar('state_hash', { length: 64 }),
  nonceHash: varchar('nonce_hash', { length: 64 }),
  cancelSecretHash: varchar('cancel_secret_hash', { length: 64 }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// ---------- Clients ----------
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  industry: varchar('industry', { length: 120 }),
  website: varchar('website', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ---------- Brand Kits ----------
export const brandKits = pgTable('brand_kits', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  segment: varchar('segment', { length: 120 }),
  targetAudience: text('target_audience'),
  personality: text('personality'),
  toneOfVoice: text('tone_of_voice'),
  slogan: varchar('slogan', { length: 200 }),
  mission: text('mission'),
  values: text('values'),
  recommendedWords: jsonb('recommended_words').$type<string[]>().notNull().default([]),
  prohibitedWords: jsonb('prohibited_words').$type<string[]>().notNull().default([]),
  brandExpressions: jsonb('brand_expressions').$type<string[]>().notNull().default([]),
  hierarchyRules: text('hierarchy_rules'),
  approvedLogos: jsonb('approved_logos').$type<string[]>().notNull().default([]),
  logoVariations: jsonb('logo_variations').$type<string[]>().notNull().default([]),
  icons: jsonb('icons').$type<string[]>().notNull().default([]),
  graphicElements: jsonb('graphic_elements').$type<string[]>().notNull().default([]),
  approvedPhotos: jsonb('approved_photos').$type<string[]>().notNull().default([]),
  references: jsonb('references').$type<string[]>().notNull().default([]),
  approvedExamples: jsonb('approved_examples').$type<string[]>().notNull().default([]),
  rejectedExamples: jsonb('rejected_examples').$type<string[]>().notNull().default([]),
  usageRules: text('usage_rules'),
  restrictions: text('restrictions'),
  legalInfo: text('legal_info'),
  productsAndServices: text('products_and_services'),
  approvedCtas: jsonb('approved_ctas').$type<string[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const brandKitVersions = pgTable('brand_kit_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandKitId: uuid('brand_kit_id')
    .notNull()
    .references(() => brandKits.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
});

export const brandColors = pgTable('brand_colors', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandKitId: uuid('brand_kit_id')
    .notNull()
    .references(() => brandKits.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  hex: varchar('hex', { length: 7 }).notNull(),
  rgb: varchar('rgb', { length: 20 }).notNull(),
  cmyk: varchar('cmyk', { length: 40 }),
  colorRole: varchar('color_role', { length: 20 }).notNull().default('primary'),
  contrast: varchar('contrast', { length: 40 }),
  priority: integer('priority').notNull().default(0),
});

export const brandFonts = pgTable('brand_fonts', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandKitId: uuid('brand_kit_id')
    .notNull()
    .references(() => brandKits.id, { onDelete: 'cascade' }),
  family: varchar('family', { length: 120 }).notNull(),
  weight: varchar('weight', { length: 40 }).notNull(),
  style: varchar('style', { length: 40 }).notNull(),
  functionRole: varchar('function_role', { length: 20 }).notNull().default('primary'),
  file: text('file'),
  origin: varchar('origin', { length: 200 }),
  license: varchar('license', { length: 200 }),
  commercialRightsConfirmed: boolean('commercial_rights_confirmed').notNull().default(false),
});

export const brandRules = pgTable('brand_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandKitId: uuid('brand_kit_id')
    .notNull()
    .references(() => brandKits.id, { onDelete: 'cascade' }),
  ruleType: varchar('rule_type', { length: 60 }).notNull(),
  ruleText: text('rule_text').notNull(),
});

// ---------- Assets ----------
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brandAssets = pgTable('brand_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  brandKitId: uuid('brand_kit_id').references(() => brandKits.id, { onDelete: 'set null' }),
  storageKey: text('storage_key').notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  orientation: assetOrientationEnum('orientation').default('any'),
  predominantColorHex: varchar('predominant_color_hex', { length: 7 }),
  status: assetStatusEnum('status').notNull().default('pending'),
  license: varchar('license', { length: 200 }),
  commercialRightsConfirmed: boolean('commercial_rights_confirmed').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  priority: integer('priority').notNull().default(0),
  assetHash: varchar('asset_hash', { length: 64 }),
  version: integer('version').notNull().default(1),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const assetCollections = pgTable('asset_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetTags = pgTable('asset_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
});

export const assetTagRelations = pgTable(
  'asset_tag_relations',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => assetTags.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.assetId, t.tagId] }) }),
);

export const assetCollectionRelations = pgTable(
  'asset_collection_relations',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => assetCollections.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.assetId, t.collectionId] }) }),
);

export const assetProductRelations = pgTable(
  'asset_product_relations',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.assetId, t.productId] }) }),
);

export const assetCampaignRelations = pgTable(
  'asset_campaign_relations',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.assetId, t.campaignId] }) }),
);

// ---------- Prompt templates ----------
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  kind: promptTemplateKindEnum('kind').notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  body: text('body').notNull(),
  defaultMode: promptModeEnum('default_mode').notNull().default('professional'),
  isSystem: boolean('is_system').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promptTemplateVersions = pgTable('prompt_template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => promptTemplates.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Campaigns ----------
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  brandKitId: uuid('brand_kit_id').references(() => brandKits.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 160 }).notNull(),
  objective: text('objective'),
  productOrService: text('product_or_service'),
  audience: text('audience'),
  channel: varchar('channel', { length: 120 }),
  format: varchar('format', { length: 120 }),
  dimensions: varchar('dimensions', { length: 60 }),
  offer: text('offer'),
  cta: varchar('cta', { length: 500 }),
  date: varchar('date', { length: 60 }),
  tone: varchar('tone', { length: 200 }),
  mandatoryContent: jsonb('mandatory_content').$type<string[]>().notNull().default([]),
  prohibitedContent: jsonb('prohibited_content').$type<string[]>().notNull().default([]),
  references: jsonb('references').$type<string[]>().notNull().default([]),
  selectedAssetIds: jsonb('selected_asset_ids').$type<string[]>().notNull().default([]),
  promptMode: promptModeEnum('prompt_mode').notNull().default('professional'),
  variations: integer('variations').notNull().default(1),
  status: campaignStatusEnum('status').notNull().default('draft'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  observations: text('observations'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const campaignAssets = pgTable(
  'campaign_assets',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.campaignId, t.assetId] }) }),
);

// ---------- Generated prompts ----------
export const generatedPrompts = pgTable('generated_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  brandKitId: uuid('brand_kit_id').references(() => brandKits.id, { onDelete: 'set null' }),
  brandKitVersion: integer('brand_kit_version'),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => promptTemplates.id, { onDelete: 'set null' }),
  templateVersion: integer('template_version'),
  mode: promptModeEnum('mode').notNull(),
  originalText: text('original_text').notNull(),
  editedText: text('edited_text'),
  editedBy: uuid('edited_by').references(() => users.id),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  promptHash: varchar('prompt_hash', { length: 64 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Creative packages ----------
export const creativePackages = pgTable('creative_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  creatorId: uuid('creator_id').references(() => users.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  storageKey: text('storage_key').notNull(),
  manifestJson: jsonb('manifest_json').notNull(),
  promptVersion: integer('prompt_version').notNull(),
  brandKitVersion: integer('brand_kit_version').notNull(),
  declaredRights: text('declared_rights').notNull(),
  acceptanceText: text('acceptance_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packageFiles = pgTable('package_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: uuid('package_id')
    .notNull()
    .references(() => creativePackages.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
});

// ---------- Legal ----------
export const legalAcceptances = pgTable('legal_acceptances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  termsVersion: varchar('terms_version', { length: 40 }).notNull(),
  privacyVersion: varchar('privacy_version', { length: 40 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Results / approvals ----------
export const results = pgTable('results', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  promptId: uuid('prompt_id').references(() => generatedPrompts.id, { onDelete: 'set null' }),
  packageId: uuid('package_id').references(() => creativePackages.id, { onDelete: 'set null' }),
  status: resultStatusEnum('status').notNull().default('submitted'),
  textContent: text('text_content'),
  storageKey: text('storage_key'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const resultVersions = pgTable('result_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultId: uuid('result_id')
    .notNull()
    .references(() => results.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 40 }).notNull(),
  targetId: uuid('target_id').notNull(),
  authorId: uuid('author_id').references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  resultId: uuid('result_id')
    .notNull()
    .references(() => results.id, { onDelete: 'cascade' }),
  decision: varchar('decision', { length: 20 }).notNull(),
  decidedBy: uuid('decided_by').references(() => users.id),
  comment: text('comment'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Billing / usage / audit ----------
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tier: planTierEnum('tier').notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  priceBRLMonthly: integer('price_brl_monthly').notNull().default(0),
  limits: jsonb('limits').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  tier: planTierEnum('tier').notNull(),
  provider: billingProviderEnum('provider').notNull().default('mock'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usageCounters = pgTable('usage_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  metric: varchar('metric', { length: 60 }).notNull(),
  period: varchar('period', { length: 20 }).notNull(),
  count: integer('count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 60 }).notNull(),
  entityId: uuid('entity_id'),
  requestId: varchar('request_id', { length: 64 }),
  ip: varchar('ip', { length: 64 }),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const globalNotices = pgTable('global_notices', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Relations (for query building) ----------
import { relations } from 'drizzle-orm';
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  clients: many(clients),
  brandKits: many(brandKits),
}));
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  assets: many(campaignAssets),
}));

export const schema = {
  users,
  organizations,
  organizationMembers,
  extensionSessions,
  authCodes,
  clients,
  brandKits,
  brandKitVersions,
  brandColors,
  brandFonts,
  brandRules,
  products,
  brandAssets,
  assetCollections,
  assetTags,
  assetTagRelations,
  assetCollectionRelations,
  assetProductRelations,
  assetCampaignRelations,
  promptTemplates,
  promptTemplateVersions,
  campaigns,
  campaignAssets,
  generatedPrompts,
  creativePackages,
  packageFiles,
  legalAcceptances,
  results,
  resultVersions,
  comments,
  approvals,
  plans,
  subscriptions,
  usageCounters,
  auditLogs,
  globalNotices,
  organizationsRelations,
  campaignsRelations,
};
