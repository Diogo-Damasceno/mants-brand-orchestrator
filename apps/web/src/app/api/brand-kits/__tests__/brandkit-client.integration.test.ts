import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Integração real (PostgreSQL) da vinculação Brand Kit <-> Cliente.
 * Cada teste usa org/cliente próprios (evita limite de plano e colisão de FK).
 * - POST aceita clientId, devolve 201 com clientId;
 * - POST 404 se o cliente for de outra organização;
 * - GET [id] retorna clientId;
 * - PATCH rejeita (404) trocar clientId para cliente de outra org.
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente: testes de integração exigem PostgreSQL real.');
}

const { getDb, schema } = await import('@mants/database');
const { signSession, hashSessionToken } = await import('@mants/auth');
const { getServerConfig } = await import('@mants/config');
const { eq } = await import('drizzle-orm');

const AUTH_SECRET = getServerConfig().authSecret || 'test-secret';
const db = getDb();

function tokenFor(sub: string, org: string): string {
  return signSession({ sub, org, roles: ['organization_owner'], deviceId: 'dev', ext: true }, AUTH_SECRET, 3600);
}
function req(method: string, path: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const minimalBk = {
  name: 'BK Teste',
  recommendedWords: [], prohibitedWords: [], brandExpressions: [],
  colors: [], fonts: [], approvedLogos: [], logoVariations: [], icons: [],
  graphicElements: [], approvedPhotos: [], references: [], approvedExamples: [],
  rejectedExamples: [], approvedCtas: [],
};

let orgId: string, userId: string, token: string, clientId: string;

beforeEach(async () => {
  orgId = crypto.randomUUID();
  userId = crypto.randomUUID();
  token = tokenFor(userId, orgId);
  await db.insert(schema.organizations).values({ id: orgId, name: 'Org', slug: `org-${Math.random().toString(36).slice(2, 7)}` });
  await db.insert(schema.users).values({ id: userId, email: `u-${Math.random().toString(36).slice(2, 8)}@t.dev`, name: 'U', passwordHash: 'x' });
  await db.insert(schema.organizationMembers).values({ organizationId: orgId, userId, role: 'organization_owner' });
  await db.insert(schema.extensionSessions).values({ userId, organizationId: orgId, deviceId: 'dev', tokenHash: hashSessionToken(token), status: 'active', expiresAt: new Date(Date.now() + 3600_000) });
  clientId = crypto.randomUUID();
  await db.insert(schema.clients).values({ id: clientId, organizationId: orgId, name: 'Cliente' });
});

afterEach(async () => {
  await db.delete(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId));
  await db.delete(schema.clients).where(eq(schema.clients.organizationId, orgId));
  await db.delete(schema.extensionSessions).where(eq(schema.extensionSessions.organizationId, orgId));
  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
});

describe('Brand Kit <-> Cliente', () => {
  it('POST aceita clientId e devolve 201 com clientId', async () => {
    const mod = await import('../route');
    const res = await mod.POST(req('POST', '/api/brand-kits', token, { ...minimalBk, clientId }));
    expect(res.status).toBe(201);
    const d = (await res.json()) as { id: string; clientId: string | null };
    expect(d.clientId).toBe(clientId);
    const g = await (await import('../[id]/route')).GET(req('GET', `/api/brand-kits/${d.id}`, token));
    expect(g.status).toBe(200);
    const gd = (await g.json()) as { brandKit: { clientId: string | null } };
    expect(gd.brandKit.clientId).toBe(clientId);
  });

  it('POST 404 se o cliente for de outra organização', async () => {
    const otherOrg = crypto.randomUUID();
    const otherClient = crypto.randomUUID();
    await db.insert(schema.organizations).values({ id: otherOrg, name: 'Outra', slug: `out-${Math.random().toString(36).slice(2, 7)}` });
    await db.insert(schema.clients).values({ id: otherClient, organizationId: otherOrg, name: 'Cliente Outro' });
    const mod = await import('../route');
    const res = await mod.POST(req('POST', '/api/brand-kits', token, { ...minimalBk, clientId: otherClient }));
    expect(res.status).toBe(404);
  });

  it('PATCH rejeita (404) trocar clientId para cliente de outra org', async () => {
    const mod = await import('../route');
    const created = await mod.POST(req('POST', '/api/brand-kits', token, { ...minimalBk, clientId }));
    const id = ((await created.json()) as { id: string }).id;
    const otherOrg = crypto.randomUUID();
    const otherClient = crypto.randomUUID();
    await db.insert(schema.organizations).values({ id: otherOrg, name: 'Outra2', slug: `o2-${Math.random().toString(36).slice(2, 7)}` });
    await db.insert(schema.clients).values({ id: otherClient, organizationId: otherOrg, name: 'Cliente Outro2' });
    const p = await (await import('../[id]/route')).PATCH(req('PATCH', `/api/brand-kits/${id}`, token, { name: 'BK2', clientId: otherClient }));
    expect(p.status).toBe(404);
  });
});
