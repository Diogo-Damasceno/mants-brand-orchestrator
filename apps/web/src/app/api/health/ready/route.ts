import { NextResponse } from 'next/server';
import { getDb } from '@mants/database';
import { getServerConfig } from '@mants/config';
import { sql } from 'drizzle-orm';

/**
 * Readiness: verifica dependências obrigatórias sem expor segredos.
 * - conexão PostgreSQL (query simples);
 * - migrations aplicadas (tabela _mants_migrations não vazia / existe);
 * - configuração do storage (provider + endpoint + bucket presentes e não-local em produção).
 */
export async function GET() {
  const problems: string[] = [];

  // 1. PostgreSQL
  try {
    await getDb().execute(sql`select 1`);
  } catch {
    problems.push('postgres_unavailable');
  }

  // 2. Migrations aplicadas
  try {
    const res = (await getDb().execute(
      sql`select count(*)::int as n from _mants_migrations`,
    )) as unknown as { rows?: Array<Record<string, unknown>> };
    const first = res?.rows?.[0] ?? {};
    const raw = Object.values(first)[0];
    const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw ?? 0);
    if (!Number.isFinite(n) || n === 0) problems.push('no_migrations');
  } catch {
    problems.push('migrations_table_missing');
  }

  // 3. Storage configurado (sem expor credenciais)
  const cfg = getServerConfig();
  const isProd = cfg.nodeEnv === 'production';
  if (cfg.storageProvider === 'local' && isProd) {
    problems.push('storage_local_in_production');
  }
  if (!cfg.storageEndpoint || !cfg.storageBucket) {
    problems.push('storage_not_configured');
  }

  if (problems.length > 0) {
    return NextResponse.json(
      { status: 'not_ready', checks: { postgres: problems.includes('postgres_unavailable') ? 'fail' : 'ok', migrations: problems.includes('no_migrations') || problems.includes('migrations_table_missing') ? 'fail' : 'ok', storage: problems.includes('storage_not_configured') || problems.includes('storage_local_in_production') ? 'fail' : 'ok' }, problems },
      { status: 503 },
    );
  }
  return NextResponse.json({
    status: 'ready',
    checks: { postgres: 'ok', migrations: 'ok', storage: 'ok', storageProvider: cfg.storageProvider },
  });
}
