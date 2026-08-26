import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://mants:mants_password@localhost:5432/mants_test';

function dbAvailable(): boolean {
  try {
    execFileSync('psql', [TEST_DB, '-tAc', 'SELECT 1'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

const maybe = dbAvailable() ? describe : describe.skip;

/**
 * O runner de migrations deve ser idempotente e seguro contra corrida:
 * rodar duas vezes contra um banco fresco não deve falhar e a segunda
 * execução deve reportar "já aplicada" para todas.
 */
maybe('Migration runner (Postgres real)', () => {
  it('roda duas vezes sem erro (idempotente)', () => {
    const env = { ...process.env, DATABASE_URL: TEST_DB };
    const first = execFileSync('pnpm', ['--filter', '@mants/database', 'migrate'], { env, encoding: 'utf8' });
    expect(first).toContain('aplicada');
    const second = execFileSync('pnpm', ['--filter', '@mants/database', 'migrate'], { env, encoding: 'utf8' });
    expect(second).toContain('já aplicada');
  });

  it('colunas PKCE existem após migration (state_hash, nonce_hash, authorized_at, cancelled_at)', () => {
    const out = execFileSync('psql', [TEST_DB, '-tAc', "SELECT column_name FROM information_schema.columns WHERE table_name='auth_codes' AND column_name IN ('state_hash','nonce_hash','authorized_at','cancelled_at') ORDER BY column_name;"], { encoding: 'utf8' });
    const cols = out.split('\n').map((s) => s.trim()).filter(Boolean);
    expect(cols.sort()).toEqual(['authorized_at', 'cancelled_at', 'nonce_hash', 'state_hash']);
  });

  it('RLS está desabilitado (isolamento via app, não via policy morta)', () => {
    const out = execFileSync('psql', [TEST_DB, '-tAc', "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relrowsecurity AND n.nspname='public';"], { encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });
});
