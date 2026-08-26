-- ============================================================================
-- Mants Brand Orchestrator — Migração 0003
-- Campos PKCE/estado do fluxo de autorização da extensão + remoção de RLS
-- enganosa (o app conecta como dono do schema, logo RLS era contornada; o
-- isolamento multi-tenant é garantido na camada da aplicação via filtro por
-- organization_id em toda consulta).
-- ============================================================================

ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS state_hash varchar(64);
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS nonce_hash varchar(64);
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS authorized_at timestamptz;
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS extension_version varchar(40);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id);

-- Remoção das policies RLS e do papel mants_app (não utilizados / não efetivos).
DO $$ BEGIN
  DROP POLICY IF EXISTS org_isolation_organizations ON organizations;
  DROP POLICY IF EXISTS org_isolation_clients ON clients;
  DROP POLICY IF EXISTS org_isolation_brand_kits ON brand_kits;
  DROP POLICY IF EXISTS org_isolation_brand_colors ON brand_colors;
  DROP POLICY IF EXISTS org_isolation_brand_fonts ON brand_fonts;
  DROP POLICY IF EXISTS org_isolation_brand_rules ON brand_rules;
  DROP POLICY IF EXISTS org_isolation_products ON products;
  DROP POLICY IF EXISTS org_isolation_brand_assets ON brand_assets;
  DROP POLICY IF EXISTS org_isolation_asset_collections ON asset_collections;
  DROP POLICY IF EXISTS org_isolation_asset_tags ON asset_tags;
  DROP POLICY IF EXISTS org_isolation_prompt_templates ON prompt_templates;
  DROP POLICY IF EXISTS org_isolation_campaigns ON campaigns;
  DROP POLICY IF EXISTS org_isolation_generated_prompts ON generated_prompts;
  DROP POLICY IF EXISTS org_isolation_creative_packages ON creative_packages;
  DROP POLICY IF EXISTS org_isolation_legal_acceptances ON legal_acceptances;
  DROP POLICY IF EXISTS org_isolation_results ON results;
  DROP POLICY IF EXISTS org_isolation_comments ON comments;
  DROP POLICY IF EXISTS org_isolation_approvals ON approvals;
  DROP POLICY IF EXISTS org_isolation_subscriptions ON subscriptions;
  DROP POLICY IF EXISTS org_isolation_usage_counters ON usage_counters;
  DROP POLICY IF EXISTS users_self ON users;
  DROP POLICY IF EXISTS ext_sessions_user ON extension_sessions;
END $$;

ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_colors DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_fonts DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE generated_prompts DISABLE ROW LEVEL SECURITY;
ALTER TABLE creative_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances DISABLE ROW LEVEL SECURITY;
ALTER TABLE results DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE extension_sessions DISABLE ROW LEVEL SECURITY;

DROP ROLE IF EXISTS mants_app;
DROP FUNCTION IF EXISTS app_current_organization();
