import { BILLING_PROVIDERS, type BillingProvider } from '@mants/shared-types';

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true' || value.trim() === '1';
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function pick<U extends string>(
  value: string | undefined,
  allowed: readonly U[],
  fallback: U,
): U {
  if (value && (allowed as readonly string[]).includes(value)) return value as U;
  return fallback;
}

/**
 * Configuração lida de variáveis de ambiente.
 * Em runtime de browser (extensão/web), use apenas os campos públicos.
 */
export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  apiBaseUrl: string;
  featureChatgptAssistedInsertion: boolean;
  databaseUrl: string;
  authSecret: string;
  sessionTtlSeconds: number;
  refreshTtlSeconds: number;
  storageProvider: 'minio' | 'r2' | 's3' | 'local';
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  storageUsePathStyle: boolean;
  storageSignedUrlTtlSeconds: number;
  billingProvider: BillingProvider;
  extensionAllowedApiOrigin: string;
  extensionMinVersion: string;
  logLevel: string;
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;
  cached = {
    nodeEnv: pick(process.env.NODE_ENV, ['development', 'test', 'production'], 'development'),
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    featureChatgptAssistedInsertion: bool(process.env.FEATURE_CHATGPT_ASSISTED_INSERTION, false),
    databaseUrl: process.env.DATABASE_URL ?? '',
    authSecret: process.env.AUTH_SECRET ?? 'insecure-dev-secret-change-me',
    sessionTtlSeconds: int(process.env.SESSION_TTL_SECONDS, 28800),
    refreshTtlSeconds: int(process.env.REFRESH_TTL_SECONDS, 2592000),
    storageProvider: pick(process.env.STORAGE_PROVIDER, ['minio', 'r2', 's3', 'local'], 'minio'),
    storageEndpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
    storageRegion: process.env.STORAGE_REGION ?? 'us-east-1',
    storageBucket: process.env.STORAGE_BUCKET ?? 'mants-private',
    storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
    storageSecretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
    storageUsePathStyle: bool(process.env.STORAGE_USE_PATH_STYLE, true),
    storageSignedUrlTtlSeconds: int(process.env.STORAGE_SIGNED_URL_TTL_SECONDS, 900),
    billingProvider: pick(process.env.BILLING_PROVIDER, BILLING_PROVIDERS, 'mock'),
    extensionAllowedApiOrigin: process.env.EXTENSION_ALLOWED_API_ORIGIN ?? 'http://localhost:3000',
    extensionMinVersion: process.env.EXTENSION_MIN_VERSION ?? '0.1.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
  return cached!;
}

/** Campos seguros para expor ao cliente (web/extensão). */
export function getPublicConfig() {
  const c = getServerConfig();
  return {
    appUrl: c.appUrl,
    apiBaseUrl: c.apiBaseUrl,
    featureChatgptAssistedInsertion: c.featureChatgptAssistedInsertion,
    extensionAllowedApiOrigin: c.extensionAllowedApiOrigin,
    extensionMinVersion: c.extensionMinVersion,
  };
}
