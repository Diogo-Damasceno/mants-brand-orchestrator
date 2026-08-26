import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Testes de INTEGRAÇÃO reais (PostgreSQL) do cancelamento público da extensão.
 *
 * Cobre o item 2 do pedido:
 *  1. iniciar fluxo sem usuário e organização;
 *  2. cancelar usando cancelSecret;
 *  3. confirmar cancelledAt;
 *  4. confirmar audit log com organizationId = null e actorId = null;
 *  5. tentar exchange e receber rejeição;
 *  6. repetir cancelamento e confirmar idempotência;
 *  7. tentar segredo incorreto;
 *  8. tentar cancelar código expirado;
 *  9. tentar cancelar código autorizado;
 * 10. simular falha da auditoria e confirmar rollback.
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente: testes de integração exigem PostgreSQL real.');
}

const { getDb, schema } = await import('@mants/database');
const { sha256Hex } = await import('@mants/auth');
const { eq } = await import('drizzle-orm');
const route = await import('../route');
const exchangeRoute = await import('../../exchange/route');

const db = getDb();

async function seedOrgUser() {
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.insert(schema.organizations).values({ id: orgId, name: 'Org A', slug: `org-a-${Math.random().toString(36).slice(2, 7)}` }).onConflictDoNothing();
  await db.insert(schema.users).values({ id: userId, email: `user-${Math.random().toString(36).slice(2, 8)}@test.dev`, name: 'U', passwordHash: 'x' }).onConflictDoNothing();
  return { orgId, userId };
}

type JsonRes = { status: number; json: () => Promise<Record<string, unknown>> };

function makeReq(body: unknown, requestId = 'req-test'): Request {
  return new Request('http://localhost/api/extension/auth/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

async function reqJson(res: unknown): Promise<JsonRes> {
  const r = res as { status: number; json: () => Promise<Record<string, unknown>> };
  return { status: r.status, json: r.json.bind(r) };
}

async function insertCode(over: Record<string, unknown> = {}) {
  const code = `code_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const cancelSecret = `sec_${code}`;
  await db.insert(schema.authCodes).values({
    code,
    codeChallenge: 'challenge',
    deviceId: 'dev-1',
    origin: 'https://api.mants.company',
    browser: 'Chrome',
    extensionVersion: '0.1.0',
    extensionName: 'Mants Brand Orchestrator',
    cancelSecretHash: sha256Hex(cancelSecret),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    ...over,
  });
  return { code, cancelSecret };
}

async function getCode(code: string) {
  const [row] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, code));
  return row;
}

async function truncateAll() {
  await db.delete(schema.auditLogs);
  await db.delete(schema.extensionSessions);
  await db.delete(schema.authCodes);
}

beforeAll(truncateAll);
afterAll(truncateAll);
beforeEach(truncateAll);

describe('cancelamento público (cancelSecret)', () => {
  it('1+2+3+4: fluxo sem user/org, cancela com cancelSecret, persiste cancelledAt e audit null', async () => {
    const { code, cancelSecret } = await insertCode();
    const res = (await reqJson(await route.POST(makeReq({ code, cancelSecret }) as never))) as JsonRes;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cancelled).toBe(true);

    const row = await getCode(code);
    expect(row).toBeDefined();
    expect(row!.cancelledAt).not.toBeNull();

    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'extension_auth_cancel'));
    expect(audit).toBeDefined();
    expect(audit!.organizationId).toBeNull();
    expect(audit!.actorId).toBeNull();
    expect(audit!.detail).toMatchObject({
      via: 'cancel_secret',
      codeMasked: `${code.slice(0, 4)}…${code.slice(-4)}`,
      deviceId: 'dev-1',
      browser: 'Chrome',
      reason: 'user_cancelled',
      requestId: 'req-test',
    });
  });

  it('5: tentar exchange de código cancelado é rejeitado (403)', async () => {
    const { code, cancelSecret } = await insertCode();
    await route.POST(makeReq({ code, cancelSecret }) as never);
    const exRes = (await reqJson(
      await exchangeRoute.POST(
        makeReq({
          code,
          codeVerifier: 'a'.repeat(32),
          deviceId: 'dev-1',
          origin: 'https://api.mants.company',
          state: 'b'.repeat(16),
          nonce: 'c'.repeat(16),
        }) as never,
      ),
    )) as JsonRes;
    expect(exRes.status).toBe(403);
  });

  it('6: repetir cancelamento é idempotente (ok, sem erro)', async () => {
    const { code, cancelSecret } = await insertCode();
    await route.POST(makeReq({ code, cancelSecret }) as never);
    const res2 = (await reqJson(await route.POST(makeReq({ code, cancelSecret }) as never))) as JsonRes;
    expect(res2.status).toBe(200);
  });

  it('7: segredo incorreto é rejeitado (403)', async () => {
    const { code } = await insertCode();
    const res = (await reqJson(await route.POST(makeReq({ code, cancelSecret: 'wrong' }) as never))) as JsonRes;
    expect(res.status).toBe(403);
  });

  it('8: código expirado não pode ser cancelado (400)', async () => {
    const { code, cancelSecret } = await insertCode({ expiresAt: new Date(Date.now() - 1000) });
    const res = (await reqJson(await route.POST(makeReq({ code, cancelSecret }) as never))) as JsonRes;
    expect(res.status).toBe(400);
  });

  it('9: código já autorizado não pode ser cancelado (409)', async () => {
    const { orgId, userId } = await seedOrgUser();
    const { code, cancelSecret } = await insertCode({
      userId,
      organizationId: orgId,
      authorizedAt: new Date(),
    });
    const res = (await reqJson(await route.POST(makeReq({ code, cancelSecret }) as never))) as JsonRes;
    expect(res.status).toBe(409);
  });

  it('10: falha na auditoria provoca rollback (cancelledAt não persiste)', async () => {
    const { code, cancelSecret } = await insertCode();
    // Injeta falha apenas no insert de auditLogs DENTRO da transação.
    const failingDb = db as unknown as { transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    const originalTxn = failingDb.transaction;
    failingDb.transaction = (async (cb: (tx: unknown) => Promise<unknown>) => {
      const origTxnFn = originalTxn as unknown as (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
      return origTxnFn(async (tx: unknown) => {
        const txProxy = new Proxy(tx as object, {
          get(target, prop, recv) {
            if (prop === 'insert') {
              return (t: unknown) => {
                if (t === (schema.auditLogs as unknown)) {
                  return { values: () => { throw new Error('audit failure simulated'); } } as never;
                }
                return (Reflect.get(target, 'insert') as (x: unknown) => unknown).call(target, t);
              };
            }
            return Reflect.get(target, prop, recv);
          },
        });
        return cb(txProxy);
      });
    }) as never;
    const res = (await reqJson(await route.POST(makeReq({ code, cancelSecret }) as never))) as JsonRes;
    failingDb.transaction = originalTxn;
    expect(res.status).toBe(500);
    const row = await getCode(code);
    expect(row!.cancelledAt).toBeNull();
  });
});
