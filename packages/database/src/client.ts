import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada.');
  _pool = new Pool({ connectionString: url, max: 10 });
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
