import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mants/shared-types': r('./packages/shared-types/src/index.ts'),
      '@mants/prompt-engine': r('./packages/prompt-engine/src/index.ts'),
      '@mants/prompt-engine/hash': r('./packages/prompt-engine/src/hash.ts'),
      '@mants/creative-package': r('./packages/creative-package/src/index.ts'),
      '@mants/asset-selection': r('./packages/asset-selection/src/index.ts'),
      '@mants/billing': r('./packages/billing/src/index.ts'),
      '@mants/auth': r('./packages/auth/src/index.ts'),
      '@mants/config': r('./packages/config/src/index.ts'),
      '@mants/validation': r('./packages/validation/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
  },
});
