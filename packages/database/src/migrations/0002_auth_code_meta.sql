-- ============================================================================
-- Mants Brand Orchestrator — Migração 0002: metadados de auth_code (extensão)
-- Adiciona extension_name e browser para a tela de autorização visual.
-- ============================================================================

ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS extension_name varchar(160) NOT NULL DEFAULT 'Mants Brand Orchestrator';
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS browser varchar(80);
