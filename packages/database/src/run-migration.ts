import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = getPool();
  const migration = join(__dirname, 'migrations', '0001_init.sql');
  const sql = readFileSync(migration, 'utf8');
  // Executa em uma transação. O script é idempotente (IF NOT EXISTS / DO $$).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration 0001_init aplicada com sucesso.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Falha na migration:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
