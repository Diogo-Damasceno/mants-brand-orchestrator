import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Testes de INTEGRAÇÃO (PostgreSQL) da validação REAL de sessão no backend
 * (GET /api/extension/session). Cobre o item 4 do pedido no servidor:
 *  - sessão válida;
 *  - sessão expirada (token);
 *  - sessão revogada (status);
 *  - organização inexistente;
 *  - membership removida;
 *  - token inválido.
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente: testes de integração exigem PostgreSQL real.');
}

const { getDb, schema } = await import('@mants/database');
const { signSession, hashSessionToken } = await import('@mants/auth');
const { getServerConfig } = await import('@mants/config');
const route = await import('../route');
import type { Role } from '@mants/shared-types';

const db = getDb();
const AUTH_SECRET = getServerConfig().authSecret || 'test-secret';

type JsonRes = { status: number; json: () => Promise<Record<string, unknown>> };
function makeReq(token: string): Request {
  return new Request('http://localhost/api/extension/session', {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as Request;
}
async function reqJson(res: unknown): Promise<JsonRes> {
  const r = res as { status: number; json: () => Promise<Record<string, unknown>> };
  return { status: r.status, json: r.json.bind(r) };
}

let orgA: string, orgB: string, userA: string, userB: string;

async function seed() {
  orgA = crypto.randomUUID();
  orgB = crypto.randomUUID();
  userA = crypto.randomUUID();
  userB = crypto.randomUUID();
  await db.insert(schema.organizations).values([
    { id: orgA, name: 'OrgA', slug: `orga-${Math.random().toString(36).slice(2, 7)}` },
    { id: orgB, name: 'OrgB', slug: `orgb-${Math.random().toString(36).slice(2, 7)}` },
  ]).onConflictDoNothing();
  await db.insert(schema.users).values([
    { id: userA, email: `a-${Math.random().toString(36).slice(2, 8)}@test.dev`, name: 'A', passwordHash: 'x' },
    { id: userB, email: `b-${Math.random().toString(36).slice(2, 8)}@test.dev`, name: 'B', passwordHash: 'x' },
  ]).onConflictDoNothing();
  await db.insert(schema.organizationMembers).values([
    { organizationId: orgA, userId: userA, role: 'organization_owner' },
  ]).onConflictDoNothing();
}

function sign(claims: Record<string, unknown>, ttl = 3600) {
  return signSession(
    {
      sub: claims.sub as string,
      org: claims.org as string,
      roles: (claims.roles as string[]) as Role[],
      deviceId: (claims.deviceId as string) ?? 'dev',
      ext: true,
    },
    AUTH_SECRET,
    ttl,
  );
}

async function insertSession(token: string, userId: string, orgId: string, status = 'active', ttlSec = 3600) {
  await db.insert(schema.extensionSessions).values({
    userId,
    organizationId: orgId,
    deviceId: 'dev',
    tokenHash: hashSessionToken(token),
    status: status as 'active' | 'revoked' | 'expired',
    expiresAt: new Date(Date.now() + ttlSec * 1000),
  });
}

beforeAll(async () => {
  await seed();
});
afterAll(async () => {
  await db.delete(schema.auditLogs);
  await db.delete(schema.extensionSessions);
  await db.delete(schema.organizationMembers);
  await db.delete(schema.users);
  await db.delete(schema.organizations);
});
beforeEach(async () => {
  await db.delete(schema.auditLogs);
  await db.delete(schema.extensionSessions);
});

describe('GET /api/extension/session', () => {
  it('sessão válida', async () => {
    const token = sign({ sub: userA, org: orgA, roles: ['organization_owner'] });
    await insertSession(token, userA, orgA);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.valid).toBe(true);
    expect(d.organizationId).toBe(orgA);
    expect(d.roles).toContain('organization_owner');
  });

  it('token inválido (401)', async () => {
    const res = (await reqJson(await route.GET(makeReq('invalid.token.here') as never))) as JsonRes;
    expect(res.status).toBe(401);
    const d = await res.json();
    expect(d.valid).toBe(false);
  });

  it('token expirado (401)', async () => {
    const token = sign({ sub: userA, org: orgA }, -10); // ttl negativo => expirado
    await insertSession(token, userA, orgA);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(401);
  });

  it('sessão expirada no servidor mesmo com token não expirado (401)', async () => {
    // Token ainda válido (exp futuro), mas o registro em extension_sessions
    // está com expiresAt no passado => defesa em profundidade do servidor.
    const token = sign({ sub: userA, org: orgA });
    await insertSession(token, userA, orgA, 'active', -5);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(401);
    const d = await res.json();
    expect(d.reason).toMatch(/servidor/i);
  });

  it('role atual da membership prevalece sobre o claim do token', async () => {
    const token = sign({ sub: userA, org: orgA, roles: ['platform_admin'] });
    await insertSession(token, userA, orgA);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    const d = await res.json();
    expect(d.roles).toEqual(['organization_owner']); // membro real, não o claim
  });

  it('sessão revogada (status) (401)', async () => {
    const token = sign({ sub: userA, org: orgA });
    await insertSession(token, userA, orgA, 'revoked');
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(401);
  });

  it('organização do token sem sessão correspondente (401)', async () => {
    // Sessão válida para (userA, orgA), mas o token é assinado apontando para
    // uma organização diferente (sem sessão ativa ali) => não encontrada => 401.
    const token = sign({ sub: userA, org: orgB });
    await insertSession(token, userA, orgA);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(401);
  });

  it('membership removida (401)', async () => {
    // userB não é membro de orgA.
    const token = sign({ sub: userB, org: orgA });
    await insertSession(token, userB, orgA);
    const res = (await reqJson(await route.GET(makeReq(token) as never))) as JsonRes;
    expect(res.status).toBe(401);
  });

  it('sem token (401)', async () => {
    const res = (await reqJson(await route.GET(makeReq('') as never))) as JsonRes;
    expect(res.status).toBe(401);
  });
});
