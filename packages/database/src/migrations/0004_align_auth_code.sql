-- ============================================================================
-- Mants Brand Orchestrator — Migração 0004: alinhamento de tipos do auth_code
-- state_hash/nonce_hash passam a varchar(64) (SHA-256 hexadecimal canônico),
-- coerente com o schema Drizzle e com a validação Zod (exatamente 64 hex chars).
-- Não altera migrations já publicadas (0001/0002/0003).
-- ============================================================================

ALTER TABLE auth_codes ALTER COLUMN state_hash TYPE varchar(64);
ALTER TABLE auth_codes ALTER COLUMN nonce_hash TYPE varchar(64);
ALTER TABLE auth_codes ALTER COLUMN extension_version TYPE varchar(40);
