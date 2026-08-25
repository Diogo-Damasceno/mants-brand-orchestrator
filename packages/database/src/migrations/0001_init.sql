-- ============================================================================
-- Mants Brand Orchestrator — Migração inicial (0001_init.sql)
-- PostgreSQL 16. Gerado manualmente para alinhar com packages/database/src/schema.ts.
-- RLS garante isolamento multi-tenant no nível do banco, além do filtro da app.
-- ============================================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE role AS ENUM ('platform_admin','organization_owner','organization_admin','brand_manager','designer','client_reviewer','viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft','preparing_package','ready_to_use','used','result_received','in_review','changes_requested','approved','archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE prompt_mode AS ENUM ('essential','professional','strict_branding','creative_exploration');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE prompt_template_kind AS ENUM ('post_instagram','story','carousel','banner','ad','promo_campaign','launch','institutional','holiday','caption','copy','visual_direction','artwork_variation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('pending','approved','rejected','archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE asset_orientation AS ENUM ('square','portrait','landscape','any');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE result_status AS ENUM ('submitted','in_review','changes_requested','approved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('basic','professional','agency');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_provider AS ENUM ('mock','mercadopago','stripe');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ext_session_status AS ENUM ('active','revoked','expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ---------- Organizations ----------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(60) NOT NULL UNIQUE,
  plan_tier plan_tier NOT NULL DEFAULT 'basic',
  billing_provider billing_provider NOT NULL DEFAULT 'mock',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid,
  PRIMARY KEY (organization_id, user_id)
);

-- ---------- Extension sessions / auth codes ----------
CREATE TABLE IF NOT EXISTS extension_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id varchar(128) NOT NULL,
  token_hash text NOT NULL,
  status ext_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ext_sessions_user ON extension_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_sessions_org ON extension_sessions(organization_id);

CREATE TABLE IF NOT EXISTS auth_codes (
  code varchar(128) PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  code_challenge text NOT NULL,
  device_id varchar(128) NOT NULL,
  origin text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- ---------- Clients ----------
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  industry varchar(120),
  website varchar(255),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);

-- ---------- Brand Kits ----------
CREATE TABLE IF NOT EXISTS brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  description text,
  segment varchar(120),
  target_audience text,
  personality text,
  tone_of_voice text,
  slogan varchar(200),
  mission text,
  values text,
  recommended_words jsonb NOT NULL DEFAULT '[]',
  prohibited_words jsonb NOT NULL DEFAULT '[]',
  brand_expressions jsonb NOT NULL DEFAULT '[]',
  hierarchy_rules text,
  approved_logos jsonb NOT NULL DEFAULT '[]',
  logo_variations jsonb NOT NULL DEFAULT '[]',
  icons jsonb NOT NULL DEFAULT '[]',
  graphic_elements jsonb NOT NULL DEFAULT '[]',
  approved_photos jsonb NOT NULL DEFAULT '[]',
  references jsonb NOT NULL DEFAULT '[]',
  approved_examples jsonb NOT NULL DEFAULT '[]',
  rejected_examples jsonb NOT NULL DEFAULT '[]',
  usage_rules text,
  restrictions text,
  legal_info text,
  products_and_services text,
  approved_ctas jsonb NOT NULL DEFAULT '[]',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bk_org ON brand_kits(organization_id);

CREATE TABLE IF NOT EXISTS brand_kit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS brand_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  name varchar(60) NOT NULL,
  hex varchar(7) NOT NULL,
  rgb varchar(20) NOT NULL,
  cmyk varchar(40),
  color_role varchar(20) NOT NULL DEFAULT 'primary',
  contrast varchar(40),
  priority integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brand_fonts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  family varchar(120) NOT NULL,
  weight varchar(40) NOT NULL,
  style varchar(40) NOT NULL,
  function_role varchar(20) NOT NULL DEFAULT 'primary',
  file text,
  origin varchar(200),
  license varchar(200),
  commercial_rights_confirmed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS brand_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  rule_type varchar(60) NOT NULL,
  rule_text text NOT NULL
);

-- ---------- Products / Assets ----------
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);

CREATE TABLE IF NOT EXISTS brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  brand_kit_id uuid REFERENCES brand_kits(id) ON DELETE SET NULL,
  storage_key text NOT NULL,
  original_name varchar(255) NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes integer NOT NULL,
  orientation asset_orientation DEFAULT 'any',
  predominant_color_hex varchar(7),
  status asset_status NOT NULL DEFAULT 'pending',
  license varchar(200),
  commercial_rights_confirmed boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  asset_hash varchar(64),
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_assets_org ON brand_assets(organization_id);

CREATE TABLE IF NOT EXISTS asset_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_tag_relations (
  asset_id uuid NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES asset_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS asset_collection_relations (
  asset_id uuid NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES asset_collections(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, collection_id)
);

CREATE TABLE IF NOT EXISTS asset_product_relations (
  asset_id uuid NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, product_id)
);

CREATE TABLE IF NOT EXISTS asset_campaign_relations (
  asset_id uuid NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, campaign_id)
);

-- ---------- Prompt templates ----------
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind prompt_template_kind NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  body text NOT NULL,
  default_mode prompt_mode NOT NULL DEFAULT 'professional',
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_org ON prompt_templates(organization_id);

CREATE TABLE IF NOT EXISTS prompt_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Campaigns ----------
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brand_kit_id uuid REFERENCES brand_kits(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  objective text,
  product_or_service text,
  audience text,
  channel varchar(120),
  format varchar(120),
  dimensions varchar(60),
  offer text,
  cta varchar(500),
  date varchar(60),
  tone varchar(200),
  mandatory_content jsonb NOT NULL DEFAULT '[]',
  prohibited_content jsonb NOT NULL DEFAULT '[]',
  references jsonb NOT NULL DEFAULT '[]',
  selected_asset_ids jsonb NOT NULL DEFAULT '[]',
  prompt_mode prompt_mode NOT NULL DEFAULT 'professional',
  variations integer NOT NULL DEFAULT 1,
  status campaign_status NOT NULL DEFAULT 'draft',
  responsible_id uuid REFERENCES users(id),
  reviewer_id uuid REFERENCES users(id),
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id);

CREATE TABLE IF NOT EXISTS campaign_assets (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES brand_assets(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, asset_id)
);

-- ---------- Generated prompts ----------
CREATE TABLE IF NOT EXISTS generated_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_kit_id uuid REFERENCES brand_kits(id) ON DELETE SET NULL,
  brand_kit_version integer,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  template_id uuid REFERENCES prompt_templates(id) ON DELETE SET NULL,
  template_version integer,
  mode prompt_mode NOT NULL,
  original_text text NOT NULL,
  edited_text text,
  edited_by uuid REFERENCES users(id),
  edited_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  prompt_hash varchar(64) NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_org ON generated_prompts(organization_id);

-- ---------- Creative packages ----------
CREATE TABLE IF NOT EXISTS creative_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES users(id),
  file_name varchar(255) NOT NULL,
  storage_key text NOT NULL,
  manifest_json jsonb NOT NULL,
  prompt_version integer NOT NULL,
  brand_kit_version integer NOT NULL,
  declared_rights text NOT NULL,
  acceptance_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_org ON creative_packages(organization_id);

CREATE TABLE IF NOT EXISTS package_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES creative_packages(id) ON DELETE CASCADE,
  path text NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes integer NOT NULL,
  sha256 varchar(64) NOT NULL
);

-- ---------- Legal ----------
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  terms_version varchar(40) NOT NULL,
  privacy_version varchar(40) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Results / approvals ----------
CREATE TABLE IF NOT EXISTS results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES generated_prompts(id) ON DELETE SET NULL,
  package_id uuid REFERENCES creative_packages(id) ON DELETE SET NULL,
  status result_status NOT NULL DEFAULT 'submitted',
  text_content text,
  storage_key text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_results_org ON results(organization_id);

CREATE TABLE IF NOT EXISTS result_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  target_type varchar(40) NOT NULL,
  target_id uuid NOT NULL,
  author_id uuid REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_org ON comments(organization_id);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  decision varchar(20) NOT NULL,
  decided_by uuid REFERENCES users(id),
  comment text,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(organization_id);

-- ---------- Billing / usage / audit ----------
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier plan_tier NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  price_brl_monthly integer NOT NULL DEFAULT 0,
  limits jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier plan_tier NOT NULL,
  provider billing_provider NOT NULL DEFAULT 'mock',
  status varchar(20) NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_org ON subscriptions(organization_id);

CREATE TABLE IF NOT EXISTS usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric varchar(60) NOT NULL,
  period varchar(20) NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_counters(organization_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  entity varchar(60) NOT NULL,
  entity_id uuid,
  request_id varchar(64),
  ip varchar(64),
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id);

CREATE TABLE IF NOT EXISTS global_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Row Level Security (RLS)
-- Cada tabela com organization_id é protegida. O papel de app (mants_app)
-- define organization_id via SET LOCAL a partir do token da requisição.
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_fonts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- Papel da aplicação (sem login direto). A connection string da app usa este papel.
DO $$ BEGIN
  CREATE ROLE mants_app;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Função que lê a organização ativa definida pela app via SET LOCAL.
CREATE OR REPLACE FUNCTION app_current_organization() RETURNS uuid AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_organization', true), '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$ LANGUAGE sql STABLE;

-- Policies por organization_id (isolate). platform_admin ignora via SET local se necessário.
CREATE POLICY org_isolation_organizations ON organizations
  USING (id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY org_isolation_clients ON clients
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_brand_kits ON brand_kits
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_brand_colors ON brand_colors
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE organization_id = app_current_organization())
         OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_brand_fonts ON brand_fonts
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE organization_id = app_current_organization())
         OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_brand_rules ON brand_rules
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE organization_id = app_current_organization())
         OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_products ON products
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_brand_assets ON brand_assets
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_asset_collections ON asset_collections
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_asset_tags ON asset_tags
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_prompt_templates ON prompt_templates
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_campaigns ON campaigns
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_generated_prompts ON generated_prompts
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_creative_packages ON creative_packages
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_legal_acceptances ON legal_acceptances
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_results ON results
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_comments ON comments
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_approvals ON approvals
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_subscriptions ON subscriptions
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY org_isolation_usage_counters ON usage_counters
  USING (organization_id = app_current_organization() OR current_setting('app.is_platform_admin', true) = 'true');

-- users e extension_sessions protegidos por user_id/session token (app injeta via SET local também).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users USING (id = current_setting('app.current_user', true)::uuid OR current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY ext_sessions_user ON extension_sessions USING (user_id = current_setting('app.current_user', true)::uuid OR current_setting('app.is_platform_admin', true) = 'true');
