-- ============================================================================
-- Mants Brand Orchestrator — Migração 0003: state/nonce, cancelamento e autorização
-- Campos para mitigação CSRF (state/nonce), cancelamento real e rastreio de
-- autorização da extensão. Nunca edita migrations já aplicadas em produção.
-- ============================================================================

ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS state_hash text;
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS nonce_hash text;
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS extension_version varchar(40);
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS authorized_at timestamptz;
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_auth_codes_user_org ON auth_codes (user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_codes_used ON auth_codes (used_at);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_token_hash ON extension_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_extension_sessions_user ON extension_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_extension_sessions_expires ON extension_sessions (expires_at);
