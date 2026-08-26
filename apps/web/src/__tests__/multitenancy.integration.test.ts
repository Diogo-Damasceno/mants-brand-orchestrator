import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Testes de INTEGRAÇÃO (PostgreSQL) de multitenancy / isolamento por organização.
 *
 * Prova que uma organização NÃO consegue acessar os dados de outra:
 *  - clients, brandKits, campaigns, assets, prompts, packages, results,
 *    approvals, sessions.
 *
 * Usa rotas reais autenticadas por Bearer (token de extensão assinado).
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente: testes de integração exigem PostgreSQL real.');
}

const { getDb, schema } = await import('@mants/database');
const { signSession, hashSessionToken } = await import('@mants/auth');
const { getServerConfig } = await import('@mants/config');
import { NextRequest } from 'next/server';
import type { Role } from '@mants/shared-types';
const { eq, and, inArray } = await import('drizzle-orm');

const AUTH_SECRET = getServerConfig().authSecret || 'test-secret';
const db = getDb();

type Res = { status: number; json: () => Promise<Record<string, unknown>> };
function req(method: string, path: string, token: string | null, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function call(r: unknown): Promise<Res> {
  const x = r as { status: number; json: () => Promise<Record<string, unknown>> };
  return { status: x.status, json: x.json.bind(x) };
}

let orgA: string, orgB: string, userA: string, userB: string;
let tokenA: string, tokenB: string;

function sign(sub: string, org: string, roles: Role[] = ['organization_owner']) {
  const t = signSession({ sub, org, roles, deviceId: 'dev', ext: true }, AUTH_SECRET, 3600);
  return t;
}

beforeAll(async () => {
  orgA = crypto.randomUUID();
  orgB = crypto.randomUUID();
  userA = crypto.randomUUID();
  userB = crypto.randomUUID();
  await db.insert(schema.organizations).values([
    { id: orgA, name: 'OrgA', slug: `mta-${Math.random().toString(36).slice(2, 7)}` },
    { id: orgB, name: 'OrgB', slug: `mtb-${Math.random().toString(36).slice(2, 7)}` },
  ]);
  await db.insert(schema.users).values([
    { id: userA, email: `ma-${Math.random().toString(36).slice(2, 8)}@t.dev`, name: 'A', passwordHash: 'x' },
    { id: userB, email: `mb-${Math.random().toString(36).slice(2, 8)}@t.dev`, name: 'B', passwordHash: 'x' },
  ]);
  await db.insert(schema.organizationMembers).values([
    { organizationId: orgA, userId: userA, role: 'organization_owner' },
    { organizationId: orgB, userId: userB, role: 'organization_owner' },
  ]);
  tokenA = sign(userA, orgA);
  tokenB = sign(userB, orgB);
  await db.insert(schema.extensionSessions).values([
    { userId: userA, organizationId: orgA, deviceId: 'dev', tokenHash: hashSessionToken(tokenA), status: 'active', expiresAt: new Date(Date.now() + 3600_000) },
    { userId: userB, organizationId: orgB, deviceId: 'dev', tokenHash: hashSessionToken(tokenB), status: 'active', expiresAt: new Date(Date.now() + 3600_000) },
  ]);
});

afterAll(async () => {
  await db.delete(schema.auditLogs);
  await db.delete(schema.approvals);
  await db.delete(schema.results);
  await db.delete(schema.generatedPrompts);
  await db.delete(schema.creativePackages);
  await db.delete(schema.campaigns);
  await db.delete(schema.brandAssets);
  await db.delete(schema.brandKits);
  await db.delete(schema.clients);
  await db.delete(schema.extensionSessions);
  await db.delete(schema.organizationMembers);
  await db.delete(schema.users);
  await db.delete(schema.organizations);
});

beforeEach(async () => {
  // Estado isolado por teste: limpa dados de negócio (deixa orgs/users/members/sessions).
  await db.delete(schema.auditLogs);
  await db.delete(schema.approvals);
  await db.delete(schema.results);
  await db.delete(schema.generatedPrompts);
  await db.delete(schema.creativePackages);
  await db.delete(schema.campaigns);
  await db.delete(schema.brandAssets);
  await db.delete(schema.brandKits);
  await db.delete(schema.clients);
});

async function createClient(orgToken: string, name: string) {
  const r = await call(await import('../app/api/clients/route').then((m) => m.POST(req('POST', '/api/clients', orgToken, { name, industry: 'x', website: 'https://x.dev' }) as never)));
  const d = (await r.json()) as { id: string };
  return d.id;
}

describe('isolamento por organização (multitenancy)', () => {
  it('clients: orgB não vê clientes da orgA', async () => {
    const idA = await createClient(tokenA, 'Cliente A');
    expect(idA).toBeTruthy();
    const rB = await call(await import('../app/api/clients/route').then((m) => m.GET(req('GET', '/api/clients', tokenB) as never)));
    const dB = (await rB.json()) as { clients?: unknown[]; error?: string };
    expect(dB.clients?.length).toBe(0);
    // E a orgA realmente os enxerga.
    const rA = await call(await import('../app/api/clients/route').then((m) => m.GET(req('GET', '/api/clients', tokenA) as never)));
    const dA = (await rA.json()) as { clients: unknown[] };
    expect(dA.clients.length).toBe(1);
  });

  it('brandKits/campaigns/assets: isolamento em cascata', async () => {
    const clientId = await createClient(tokenA, 'Cliente A');
    // Insere direto (schemas de criação são estritos) para provar o isolamento
    // nas rotas GET, que filtram por organizationId.
    const bkId = crypto.randomUUID();
    await db.insert(schema.brandKits).values({ id: bkId, organizationId: orgA, clientId, name: 'BK A', version: 1 });
    const campId = crypto.randomUUID();
    await db.insert(schema.campaigns).values({ id: campId, organizationId: orgA, clientId, brandKitId: bkId, name: 'Camp A' });
    const assetId = crypto.randomUUID();
    await db.insert(schema.brandAssets).values({ id: assetId, organizationId: orgA, brandKitId: bkId, clientId, storageKey: `org/${orgA}/${assetId}`, originalName: 'a.png', mimeType: 'image/png', sizeBytes: 10, status: 'approved', assetHash: 'x', uploadedBy: userA });

    const bkB = await call(await import('../app/api/brand-kits/route').then((m) => m.GET(req('GET', '/api/brand-kits', tokenB) as never)));
    expect(((await bkB.json()) as { brandKits: unknown[] }).brandKits.length).toBe(0);
    const campB = await call(await import('../app/api/campaigns/route').then((m) => m.GET(req('GET', '/api/campaigns', tokenB) as never)));
    expect(((await campB.json()) as { campaigns: unknown[] }).campaigns.length).toBe(0);
    const assetB = await call(await import('../app/api/assets/route').then((m) => m.GET(req('GET', '/api/assets', tokenB) as never)));
    expect(((await assetB.json()) as { assets: unknown[] }).assets.length).toBe(0);

    // E a orgA enxerga os seus.
    const bkA = await call(await import('../app/api/brand-kits/route').then((m) => m.GET(req('GET', '/api/brand-kits', tokenA) as never)));
    expect(((await bkA.json()) as { brandKits: unknown[] }).brandKits.length).toBe(1);
  });

  it('sessions: orgB não vê sessões da orgA', async () => {
    const rB = await call(await import('../app/api/extension/sessions/route').then((m) => m.GET(req('GET', '/api/extension/sessions', tokenB) as never)));
    const dB = (await rB.json()) as { sessions: unknown[] };
    expect(dB.sessions.length).toBe(1); // só a sessão da própria orgB
    const rA = await call(await import('../app/api/extension/sessions/route').then((m) => m.GET(req('GET', '/api/extension/sessions', tokenA) as never)));
    const dA = (await rA.json()) as { sessions: unknown[] };
    expect(dA.sessions.length).toBe(1); // só a sessão da própria orgA
    // Nenhuma sessão cruza: contagem de sessões ativas das duas orgs conhecidas = 2.
    const all = await db
      .select()
      .from(schema.extensionSessions)
      .where(and(eq(schema.extensionSessions.status, 'active'), inArray(schema.extensionSessions.organizationId, [orgA, orgB])));
    expect(all.length).toBe(2);
  });

  it('packages/results/approvals: isolamento por organizationId', async () => {
    const clientId = await createClient(tokenA, 'Cliente A');
    await call(await import('../app/api/brand-kits/route').then((m) => m.POST(req('POST', '/api/brand-kits', tokenA, { name: 'BK A', clientId }) as never)));
    // Insere pacote/resultado direto (build exige storage) para provar isolamento por organizationId.
    const pkgId = crypto.randomUUID();
    await db.insert(schema.creativePackages).values({ id: pkgId, organizationId: orgA, clientId, fileName: 'p.zip', storageKey: `org/${orgA}/${pkgId}.zip`, manifestJson: { promptVersion: 1, brandKitVersion: 1 }, promptVersion: 1, brandKitVersion: 1, declaredRights: 'x', acceptanceText: 'y' });
    const pkgB = await call(await import('../app/api/packages/route').then((m) => m.GET(req('GET', '/api/packages', tokenB) as never)));
    expect(((await pkgB.json()) as { packages: unknown[] }).packages.length).toBe(0);

    await db.insert(schema.results).values({ id: crypto.randomUUID(), organizationId: orgA, status: 'submitted', createdBy: userA });
    const resB = await call(await import('../app/api/results/route').then((m) => m.GET(req('GET', '/api/results', tokenB) as never)));
    expect(((await resB.json()) as { results: unknown[] }).results.length).toBe(0);
    const resA = await call(await import('../app/api/results/route').then((m) => m.GET(req('GET', '/api/results', tokenA) as never)));
    expect(((await resA.json()) as { results: unknown[] }).results.length).toBe(1);
  });
});

describe('isolamento por ID (multitenancy direto)', () => {
  async function seedClient() {
    return createClient(tokenA, 'Cliente A');
  }
  async function seedBrandKit(clientId: string) {
    const id = crypto.randomUUID();
    await db.insert(schema.brandKits).values({ id, organizationId: orgA, clientId, name: 'BK A', version: 1 });
    return id;
  }
  async function seedCampaign(clientId: string, bkId: string) {
    const id = crypto.randomUUID();
    await db.insert(schema.campaigns).values({ id, organizationId: orgA, clientId, brandKitId: bkId, name: 'Camp A' });
    return id;
  }

  it('client por ID: orgB recebe 404', async () => {
    const id = await seedClient();
    const r = await call(await import('../app/api/clients/[id]/route').then((m) => m.GET(req('GET', `/api/clients/${id}`, tokenB) as never)));
    expect(r.status).toBe(404);
    // Dono consegue.
    const rA = await call(await import('../app/api/clients/[id]/route').then((m) => m.GET(req('GET', `/api/clients/${id}`, tokenA) as never)));
    expect(rA.status).toBe(200);
  });

  it('client DELETE: orgB não apaga recurso da orgA (404)', async () => {
    const id = await seedClient();
    const r = await call(await import('../app/api/clients/[id]/route').then((m) => m.DELETE(req('DELETE', `/api/clients/${id}`, tokenB) as never)));
    expect(r.status).toBe(404);
    const still = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
    expect(still.length).toBe(1); // banco inalterado
  });

  it('brandKit por ID: orgB recebe 404 (GET/PATCH)', async () => {
    const cid = await seedClient();
    const bkId = await seedBrandKit(cid);
    const g = await call(await import('../app/api/brand-kits/[id]/route').then((m) => m.GET(req('GET', `/api/brand-kits/${bkId}`, tokenB) as never)));
    expect(g.status).toBe(404);
    const p = await call(await import('../app/api/brand-kits/[id]/route').then((m) => m.PATCH(req('PATCH', `/api/brand-kits/${bkId}`, tokenB, { name: 'hack' }) as never)));
    expect(p.status).toBe(404);
    const still = await db.select().from(schema.brandKits).where(eq(schema.brandKits.id, bkId));
    expect(still[0]!.name).toBe('BK A'); // não foi alterado
  });

  it('campaign por ID: orgB recebe 404 (GET/DELETE)', async () => {
    const cid = await seedClient();
    const bkId = await seedBrandKit(cid);
    const campId = await seedCampaign(cid, bkId);
    const g = await call(await import('../app/api/campaigns/[id]/route').then((m) => m.GET(req('GET', `/api/campaigns/${campId}`, tokenB) as never)));
    expect(g.status).toBe(404);
    const d = await call(await import('../app/api/campaigns/[id]/route').then((m) => m.DELETE(req('DELETE', `/api/campaigns/${campId}`, tokenB) as never)));
    expect(d.status).toBe(404);
    const still = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campId));
    expect(still.length).toBe(1);
  });

  it('download de asset: orgB recebe 404', async () => {
    const cid = await seedClient();
    const bkId = await seedBrandKit(cid);
    const assetId = crypto.randomUUID();
    await db.insert(schema.brandAssets).values({ id: assetId, organizationId: orgA, brandKitId: bkId, clientId: cid, storageKey: `org/${orgA}/${assetId}`, originalName: 'a.png', mimeType: 'image/png', sizeBytes: 10, status: 'approved', assetHash: 'x', uploadedBy: userA });
    const r = await call(await import('../app/api/assets/[id]/download/route').then((m) => m.GET(req('GET', `/api/assets/${assetId}/download`, tokenB) as never)));
    expect(r.status).toBe(404);
  });

  it('download de pacote: orgB recebe 404', async () => {
    const cid = await seedClient();
    const pkgId = crypto.randomUUID();
    await db.insert(schema.creativePackages).values({ id: pkgId, organizationId: orgA, clientId: cid, fileName: 'p.zip', storageKey: `org/${orgA}/${pkgId}.zip`, manifestJson: { promptVersion: 1, brandKitVersion: 1 }, promptVersion: 1, brandKitVersion: 1, declaredRights: 'x', acceptanceText: 'y' });
    const r = await call(await import('../app/api/packages/[id]/download/route').then((m) => m.GET(req('GET', `/api/packages/${pkgId}/download`, tokenB) as never)));
    expect(r.status).toBe(404);
  });

  it('edição de prompt por ID: orgB recebe 404', async () => {
    const promptId = crypto.randomUUID();
    await db.insert(schema.generatedPrompts).values({ id: promptId, organizationId: orgA, mode: 'professional', originalText: 'orig', promptHash: 'x', version: 1, createdBy: userA });
    const r = await call(await import('../app/api/prompts/[id]/route').then((m) => m.PATCH(req('PATCH', `/api/prompts/${promptId}`, tokenB, { promptId, editedText: 'hack' }) as never)));
    expect(r.status).toBe(404);
  });

  it('aprovação de resultado: orgB recebe 404', async () => {
    const resultId = crypto.randomUUID();
    await db.insert(schema.results).values({ id: resultId, organizationId: orgA, status: 'submitted', createdBy: userA });
    const r = await call(await import('../app/api/results/[id]/approvals/route').then((m) => m.POST(req('POST', `/api/results/${resultId}/approvals`, tokenB, { resultId, decision: 'approved' }) as never)));
    expect(r.status).toBe(404);
  });

  it('revogação de sessão por ID: orgB recebe 404', async () => {
    const sessionId = crypto.randomUUID();
    await db.insert(schema.extensionSessions).values({ id: sessionId, organizationId: orgA, userId: userA, deviceId: 'dev', tokenHash: 'x', status: 'active', expiresAt: new Date(Date.now() + 3600_000) });
    const mod = await import('../app/api/extension/sessions/[id]/revoke/route');
    const r = await call(await mod.POST(req('POST', `/api/extension/sessions/${sessionId}/revoke`, tokenB) as never, { params: { id: sessionId } } as never));
    expect(r.status).toBe(404);
  });
});
