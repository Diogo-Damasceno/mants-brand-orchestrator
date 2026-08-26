import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Configuração de testes de INTEGRAÇÃO (requires PostgreSQL real + MinIO real).
 * Usado pelo job de integração da pipeline; falha se DATABASE_URL/MinIO ausentes.
 *
 * Diferente do `pnpm test` (unitário, node-only), estes testes tocam o banco.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': r('./apps/web/src'),
      '@mants/shared-types': r('./packages/shared-types/src/index.ts'),
      '@mants/prompt-engine': r('./packages/prompt-engine/src/index.ts'),
      '@mants/prompt-engine/hash': r('./packages/prompt-engine/src/hash.ts'),
      '@mants/creative-package': r('./packages/creative-package/src/index.ts'),
      '@mants/asset-selection': r('./packages/asset-selection/src/index.ts'),
      '@mants/billing': r('./packages/billing/src/index.ts'),
      '@mants/auth': r('./packages/auth/src/index.ts'),
      '@mants/config': r('./packages/config/src/index.ts'),
      '@mants/validation': r('./packages/validation/src/index.ts'),
      '@mants/database': r('./packages/database/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/web/src/**/*.integration.test.ts', 'apps/extension/src/**/*.integration.test.ts'],
    pool: 'forks',
    // Arquivos rodam em sequência: compartilham um único PostgreSQL real e cada
    // afterAll limpa tabelas que outro arquivo pode precisar. Paralelismo de
    // arquivos causaria corrida (FK violation) entre arquivos.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
