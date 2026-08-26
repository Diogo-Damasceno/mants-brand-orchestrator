-- ============================================================================
-- Mants Brand Orchestrator — Migração 0005: cancelSecretHash no auth_code
-- Permite que a extensão cancele um fluxo PKCE pendente SEM depender de
-- organizationId (que só existe após a autorização). O backend compara o
-- cancelSecret enviado em tempo constante contra este hash.
-- Aditiva: não altera migrations anteriores.
-- ============================================================================

ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS cancel_secret_hash varchar(64);
