import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { spawn } from 'node:child_process';

/**
 * Teste de INTEGRAÇÃO (PostgreSQL) de migrations concorrentes.
 *
 * O runner (packages/database/src/run-migration.ts) usa pg_try_advisory_lock
 * para garantir que dois processos não reapliquem migrations. Este teste prova:
 *  - o lock é mutuamente exclusivo (segundo processo não adquire);
 *  - após release, o lock pode ser adquirido;
 *  - rodar o runner duas vezes em paralelo não duplica/aplica duas vezes.
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente: testes de integração exigem PostgreSQL real.');
}

const LOCK_KEY = 98234719;

describe('migrations concorrentes (advisory lock)', () => {
  it('lock é mutuamente exclusivo entre conexões', async () => {
    const c1 = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const c2 = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c1.connect();
    await c2.connect();
    try {
      const r1 = await c1.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
      expect(r1.rows[0]!.locked).toBe(true);
      const r2 = await c2.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
      expect(r2.rows[0]!.locked).toBe(false);
      await c1.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      const r3 = await c2.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
      expect(r3.rows[0]!.locked).toBe(true);
      await c2.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  it('rodar o runner duas vezes em paralelo não reaplica', async () => {
    const run = () =>
      new Promise<number>((resolve) => {
        const child = spawn(
          'pnpm',
          ['--filter', '@mants/database', 'exec', 'tsx', 'src/run-migration.ts'],
          { cwd: process.cwd(), env: process.env },
        );
        child.on('exit', (c) => resolve(c ?? 0));
      });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toBe(0);
    expect(b).toBe(0);
    // O estado de migrations continua íntegro.
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      const res = await c.query<{ name: string }>('SELECT name FROM _mants_migrations ORDER BY name');
      expect(res.rows.length).toBeGreaterThan(0);
      // Nenhuma migration duplicada.
      const names = res.rows.map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
    } finally {
      await c.end();
    }
  });
});
