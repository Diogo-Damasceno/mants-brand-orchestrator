import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': r('./src'),
      '@mants/shared-types': root('../../packages/shared-types/src/index.ts'),
      '@mants/prompt-engine': root('../../packages/prompt-engine/src/index.ts'),
      '@mants/creative-package': root('../../packages/creative-package/src/index.ts'),
      '@mants/asset-selection': root('../../packages/asset-selection/src/index.ts'),
      '@mants/billing': root('../../packages/billing/src/index.ts'),
      '@mants/auth': root('../../packages/auth/src/index.ts'),
      '@mants/config': root('../../packages/config/src/index.ts'),
      '@mants/validation': root('../../packages/validation/src/index.ts'),
      '@mants/database': root('../../packages/database/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    pool: 'forks',
  },
});
