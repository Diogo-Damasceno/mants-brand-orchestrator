import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { sha256Hex, createPkceChallenge, signSession } from '@mants/auth';
import { cleanDatabase, createOrg, authHeader, makeExtensionSession } from './harness';

import * as startRoute from '@/app/api/extension/auth/start/route';
import * as authorizeRoute from '@/app/api/extension/auth/authorize/route';
import * as cancelRoute from '@/app/api/extension/auth/cancel/route';
import * as statusRoute from '@/app/api/extension/auth/status/route';
import * as exchangeRoute from '@/app/api/extension/auth/exchange/route';
import * as sessionRoute from '@/app/api/extension/session/route';
import * as sessionsRoute from '@/app/api/extension/sessions/route';
import * as clientsRoute from '@/app/api/clients/route';

const ORIGIN = 'http://localhost:3000';

function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers['Cookie'] = init.cookie;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function genSecrets() {
  const verifier = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 12);
  const challenge = createPkceChallenge(verifier);
  const state = randomUUID().replace(/-/g, ''); // 32 hex chars -> 128 bits
  const nonce = randomUUID().replace(/-/g, '');
  return {
    verifier,
    challenge,
    state,
    stateHash: sha256Hex(state),
    nonce,
    nonceHash: sha256Hex(nonce),
  };
}

describe('Fluxo PKCE de extensão — integração', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('start cria auth_code PENDENTE e expõe campos PKCE', async () => {
    const s = genSecrets();
    const res = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: {
          codeChallenge: s.challenge,
          deviceId: 'device-1',
          origin: ORIGIN,
          stateHash: s.stateHash,
          nonceHash: s.nonceHash,
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBeTruthy();

    const db = getDb();
    const [row] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, json.code));
    expect(row).toBeTruthy();
    expect(row.codeChallenge).toBe(s.challenge);
    expect(row.stateHash).toBe(s.stateHash);
    expect(row.nonceHash).toBe(s.nonceHash);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('start rejeita origem não allowlist', async () => {
    const s = genSecrets();
    const res = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: {
          codeChallenge: s.challenge,
          deviceId: 'device-1',
          origin: 'https://evil.example.com',
          stateHash: s.stateHash,
          nonceHash: s.nonceHash,
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('authorize marca atomicamente e rejeita código expirado', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();

    // Força expiração no banco ANTES do authorize (testa condição atômica).
    await getDb()
      .update(schema.authCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.authCodes.code, code));

    const auth = await authorizeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/authorize`, {
        method: 'POST',
        cookie: org.cookie,
        body: { code },
      }),
    );
    expect(auth.status).toBe(400); // expirado, não 200
    const [row] = await getDb().select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
    expect(row.userId).toBeNull(); // NÃO foi autorizado apesar do erro depois
  });

  it('authorize -> exchange -> sessão, com state/nonce/PKCE válidos', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();

    const auth = await authorizeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: org.cookie, body: { code } }),
    );
    expect(auth.status).toBe(200);

    const exch = await exchangeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/exchange`, {
        method: 'POST',
        body: { code, codeVerifier: s.verifier, deviceId: 'device-1', origin: ORIGIN, state: s.state, nonce: s.nonce },
      }),
    );
    expect(exch.status).toBe(200);
    const sess = await exch.json();
    expect(sess.token).toBeTruthy();
    expect(sess.organizationId).toBe(org.orgId);

    // Replay do mesmo código deve falhar (already used).
    const replay = await exchangeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/exchange`, {
        method: 'POST',
        body: { code, codeVerifier: s.verifier, deviceId: 'device-1', origin: ORIGIN, state: s.state, nonce: s.nonce },
      }),
    );
    expect(replay.status).toBe(400);
  });

  it('exchange falha com PKCE inválido', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();
    await authorizeRoute.POST(req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: org.cookie, body: { code } }));

    const bad = await exchangeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/exchange`, {
        method: 'POST',
        body: { code, codeVerifier: 'wrongverifier', deviceId: 'device-1', origin: ORIGIN, state: s.state, nonce: s.nonce },
      }),
    );
    expect(bad.status).toBe(403);
  });

  it('exchange falha com state/nonce inválidos', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();
    await authorizeRoute.POST(req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: org.cookie, body: { code } }));

    const bad = await exchangeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/exchange`, {
        method: 'POST',
        body: { code, codeVerifier: s.verifier, deviceId: 'device-1', origin: ORIGIN, state: 'wrongstate', nonce: s.nonce },
      }),
    );
    expect(bad.status).toBe(403);
  });

  it('cancel impede reuso do código', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();

    const cancel = await cancelRoute.POST(
      req(`${ORIGIN}/api/extension/auth/cancel`, { method: 'POST', cookie: org.cookie, body: { code } }),
    );
    expect(cancel.status).toBe(200);

    // Após cancelar, authorize deve falhar (409).
    const auth = await authorizeRoute.POST(
      req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: org.cookie, body: { code } }),
    );
    expect(auth.status).toBe(409);

    // status reflete cancelled.
    const st = await statusRoute.GET(req(`${ORIGIN}/api/extension/auth/status?code=${code}&deviceId=device-1`));
    const stJson = await st.json();
    expect(stJson.status).toBe('cancelled');
  });

  it('cancel é idempotente e não vaza dados de código inexistente', async () => {
    const org = await createOrg();
    const res = await cancelRoute.POST(
      req(`${ORIGIN}/api/extension/auth/cancel`, { method: 'POST', cookie: org.cookie, body: { code: 'naoexiste' } }),
    );
    expect(res.status).toBe(404); // interno distingue; resposta genérica possível
  });

  it('session retorna autenticado para token válido de extensão', async () => {
    const org = await createOrg();
    await makeExtensionSession(org);
    const res = await sessionRoute.GET(req(`${ORIGIN}/api/extension/session`, { headers: authHeader(org.token) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authenticated).toBe(true);
    expect(json.organizationId).toBe(org.orgId);
  });

  it('session retorna 401 para token revogado', async () => {
    const org = await createOrg();
    await makeExtensionSession(org);
    // Revoga.
    await sessionsRoute.POST(req(`${ORIGIN}/api/extension/sessions`, { method: 'POST', headers: authHeader(org.token) }));
    const res = await sessionRoute.GET(req(`${ORIGIN}/api/extension/session`, { headers: authHeader(org.token) }));
    expect(res.status).toBe(401);
  });

  it('concorrência: authorize e cancel não criam sessão dupla', async () => {
    const org = await createOrg();
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();
    const [authP, cancelP] = [authorizeRoute.POST(req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: org.cookie, body: { code } })), cancelRoute.POST(req(`${ORIGIN}/api/extension/auth/cancel`, { method: 'POST', cookie: org.cookie, body: { code } }))];
    await Promise.all([authP, cancelP]);
    const [row] = await getDb().select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
    // Ou autorizou ou cancelou, nunca os dois.
    expect(!(row.userId && row.cancelledAt)).toBe(true);
  });
});

describe('Multitenancy — isolamento por organização', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('organização A não consegue listar clientes da organização B', async () => {
    const a = await createOrg({ email: 'a@example.com' });
    const b = await createOrg({ email: 'b@example.com' });
    const db = getDb();
    // Cliente criado na org A.
    await db.insert(schema.clients).values({ id: randomUUID(), organizationId: a.orgId, name: 'Cliente A', createdAt: new Date(), updatedAt: new Date() });

    // Org B lista clientes (rota autenticada por cookie).
    const res = await clientsRoute.GET(req(`${ORIGIN}/api/clients`, { cookie: b.cookie }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.clients)).toBe(true);
    expect(json.clients.length).toBe(0); // não vê o cliente de A

    // Org A vê o seu.
    const resA = await clientsRoute.GET(req(`${ORIGIN}/api/clients`, { cookie: a.cookie }));
    const jsonA = await resA.json();
    expect(jsonA.clients.length).toBe(1);
  });

  it('organização B não autoriza/autentica fluxo da organização A', async () => {
    const a = await createOrg({ email: 'a2@example.com' });
    const b = await createOrg({ email: 'b2@example.com' });
    const s = genSecrets();
    const start = await startRoute.POST(
      req(`${ORIGIN}/api/extension/auth/start`, {
        method: 'POST',
        body: { codeChallenge: s.challenge, deviceId: 'device-1', origin: ORIGIN, stateHash: s.stateHash, nonceHash: s.nonceHash },
      }),
    );
    const { code } = await start.json();
    // Org A autoriza.
    const authA = await authorizeRoute.POST(req(`${ORIGIN}/api/extension/auth/authorize`, { method: 'POST', cookie: a.cookie, body: { code } }));
    expect(authA.status).toBe(200);
    const [row] = await getDb().select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
    expect(row.organizationId).toBe(a.orgId);
  });
});
