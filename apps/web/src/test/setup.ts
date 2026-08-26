// Setup de testes de integração: configura env e cria o schema no Postgres de teste.
import { execFileSync } from 'node:child_process';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://mants:mants_password@localhost:5432/mants_test';

// Força ambiente de teste antes de importar qualquer módulo que leia config.
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = 'test';
env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_DB;
env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-min-32-chars-long-0000000000';
env.STORAGE_PROVIDER = 'local';
env.STORAGE_LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT ?? '/tmp/mants-test-storage';
env.APP_URL = 'http://localhost:3000';
env.API_BASE_URL = 'http://localhost:3000';
env.EXTENSION_ALLOWED_API_ORIGIN = 'http://localhost:3000';
env.EXTENSION_MIN_VERSION = '0.1.0';

// Aponta DATABASE_URL da migration para o banco de teste e roda as migrations.
execFileSync('pnpm', ['--filter', '@mants/database', 'migrate'], {
  env: { ...process.env, DATABASE_URL: TEST_DB },
  stdio: 'inherit',
});
