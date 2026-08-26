import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { hashPassword, signSession, sha256Hex } from '@mants/auth';

export interface TestOrg {
  userId: string;
  orgId: string;
  email: string;
  password: string;
  role: string;
  cookie: string;
  token: string;
}

/** Limpa tabelas relevantes para isolamento entre testes. */
export async function cleanDatabase(): Promise<void> {
  const db = getDb();
  // Ordem: dependentes primeiro.
  await db.delete(schema.auditLogs);
  await db.delete(schema.extensionSessions);
  await db.delete(schema.authCodes);
  await db.delete(schema.generatedPrompts);
  await db.delete(schema.campaignAssets);
  await db.delete(schema.campaigns);
  await db.delete(schema.brandAssets);
  await db.delete(schema.brandKits);
  await db.delete(schema.clients);
  await db.delete(schema.organizationMembers);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
}

/** Cria uma organização + usuário dono + sessão web (cookie) e token de extensão. */
export async function createOrg(opts: { role?: string; email?: string } = {}): Promise<TestOrg> {
  const db = getDb();
  const userId = randomUUID();
  const orgId = randomUUID();
  const email = opts.email ?? `user_${randomUUID().slice(0, 8)}@example.com`;
  const password = 'SenhaForte123';
  const role = opts.role ?? 'organization_owner';

  await db.insert(schema.users).values({
    id: userId,
    email,
    name: 'Test User',
    passwordHash: hashPassword(password),
  });
  await db.insert(schema.organizations).values({ id: orgId, name: 'Org Test', slug: `org-${randomUUID().slice(0, 8)}` });
  await db.insert(schema.organizationMembers).values({ organizationId: orgId, userId, role });
  await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    organizationId: orgId,
    tier: 'basic',
    provider: 'mock',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
  });

  const cookie = signSession({ sub: userId, org: orgId, roles: [role], ext: false }, 'test-secret-min-32-chars-long-0000000000', 3600);
  const token = signSession({ sub: userId, org: orgId, roles: [role], deviceId: 'dev-test', ext: true }, 'test-secret-min-32-chars-long-0000000000', 3600);

  return { userId, orgId, email, password, role, cookie, token };
}

export async function makeExtensionSession(org: TestOrg): Promise<string> {
  const db = getDb();
  const tokenHash = sha256Hex(org.token);
  await db.insert(schema.extensionSessions).values({
    userId: org.userId,
    organizationId: org.orgId,
    deviceId: 'dev-test',
    tokenHash,
    status: 'active',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return org.token;
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function cookieHeader(cookie: string): Record<string, string> {
  return { Cookie: `mants_session=${cookie}` };
}
