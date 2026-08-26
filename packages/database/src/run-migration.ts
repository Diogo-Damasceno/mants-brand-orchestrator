import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { getPool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = getPool();
  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => /^000\d_.*\.sql$/.test(f))
    .sort();

  const client = await pool.connect();
  try {
    // Trava exclusiva de migração antes de ler o estado aplicado.
    await client.query('SELECT pg_advisory_lock(983147213)');
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS _mants_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT name, checksum FROM _mants_migrations');
    const applied = new Map<string, string>();
    for (const r of rows) applied.set(r.name, r.checksum);
    await client.query('COMMIT');

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum) {
          throw new Error(`Checksum alterado para migração já aplicada: ${file}`);
        }
        console.log(`Migration ${file} já aplicada (checksum ok).`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _mants_migrations(name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`Migration ${file} aplicada com sucesso.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } catch (err) {
    console.error('Falha na migration:', err);
    process.exitCode = 1;
  } finally {
    await client.query('SELECT pg_advisory_unlock(983147213)').catch(() => {});
    client.release();
    await pool.end();
  }
}

main();
