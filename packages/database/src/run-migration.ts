import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, type DbPool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

interface MigrationRow {
  name: string;
  checksum: string;
}

async function loadApplied(client: DbPool): Promise<Map<string, string>> {
  const res = await client.query<MigrationRow>('SELECT name, checksum FROM _mants_migrations ORDER BY name');
  const map = new Map<string, string>();
  for (const row of res.rows) map.set(row.name, row.checksum);
  return map;
}

async function main() {
  const pool = getPool();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    // Garante tabela de controle.
    await client.query(`
      CREATE TABLE IF NOT EXISTS _mants_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = await loadApplied(client);

    // Lock exclusivo para evitar dois processos concorrentes.
    await client.query('SELECT pg_advisory_lock(98234719)');

    let pending = 0;
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const cs = checksum(sql);

      if (applied.has(file)) {
        const previous = applied.get(file)!;
        if (previous !== cs) {
          throw new Error(
            `Checksum alterado para migration já aplicada: ${file}. Reverta o arquivo ou crie uma nova migration incremental.`,
          );
        }
        continue; // já aplicada, não reaplicar
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _mants_migrations (name, checksum) VALUES ($1, $2)', [file, cs]);
        await client.query('COMMIT');
        pending++;
        console.log(`Migration aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Falha na migration ${file}:`, err);
        process.exitCode = 1;
        return;
      }
    }

    await client.query('SELECT pg_advisory_unlock(98234719)');
    if (pending === 0) {
      console.log('Nenhuma migration pendente.');
    } else {
      console.log(`${pending} migration(s) aplicada(s).`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(98234719)').catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro no migration runner:', err);
  process.exitCode = 1;
});
