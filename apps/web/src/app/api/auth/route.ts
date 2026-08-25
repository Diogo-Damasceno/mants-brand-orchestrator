import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerConfig } from '@mants/config';
import { hashPassword, verifyPassword, signSession, generatePkce } from '@mants/auth';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { registerSchema, loginSchema, extensionCodeExchangeSchema } from '@mants/validation';
import { createOrganizationWithOwner } from '@/lib/server/repositories';

export async function POST_register(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());
    const db = getDb();
    const email = body.email.toLowerCase();
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existing) throw new HttpError(409, 'E-mail já cadastrado.');
    const userId = randomUUID();
    const orgId = await createOrganizationWithOwner({
      name: body.organizationName,
      slug: body.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      ownerId: userId,
      ownerEmail: email,
      ownerName: body.name,
    });
    await db.insert(schema.users).values({
      id: userId,
      email,
      name: body.name,
      passwordHash: hashPassword(body.password),
    });
    const token = signSession(
      { sub: userId, org: orgId, roles: ['organization_owner'] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    return json({ token, userId, organizationId: orgId }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_login(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const db = getDb();
    const email = body.email.toLowerCase();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, user.id))
      .limit(1);
    const orgId = member?.organizationId ?? user.id;
    const token = signSession(
      { sub: user.id, org: orgId, roles: member ? [member.role] : ['viewer'] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    return json({ token, userId: user.id, organizationId: orgId });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET_me(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const db = getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.userId));
    const members = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, ctx.userId));
    return json({
      user: { id: user?.id, name: user?.name, email: user?.email },
      activeOrganizationId: ctx.organizationId,
      roles: ctx.roles,
      organizations: members.map((m) => ({ id: m.organizationId, role: m.role })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Fluxo de autenticação da extensão (PKCE + código de uso único).
 * 1) Extensão chama /api/extension/auth/start com code_challenge -> recebe authUrl com code.
 * 2) Usuário autentica no site (cookie da sessão web), site troca por code.
 * 3) Extensão chama /api/extension/auth/exchange (PKCE) -> recebe token de sessão curta.
 */
export async function POST_extensionAuthStart(req: NextRequest) {
  try {
    const body = await req.json();
    const codeChallenge = String(body.codeChallenge ?? '');
    const deviceId = String(body.deviceId ?? '');
    const origin = String(body.origin ?? '');
    if (!codeChallenge || !deviceId || !origin) throw new HttpError(400, 'Parâmetros ausentes.');
    if (!origin.startsWith('chrome-extension://') && !origin.startsWith('http')) {
      throw new HttpError(400, 'Origem inválida.');
    }
    const db = getDb();
    const code = randomUUID() + randomUUID().replace(/-/g, '').slice(0, 32);
    await db.insert(schema.authCodes).values({
      code,
      userId: '', // preenchido após login no site; aqui apenas reserva
      organizationId: '',
      codeChallenge,
      deviceId,
      origin,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST_extensionAuthExchange(req: NextRequest) {
  try {
    const body = extensionCodeExchangeSchema.parse(await req.json());
    const db = getDb();
    const [codeRow] = await db.select().from(schema.authCodes).where(eq(schema.authCodes.code, body.code));
    if (!codeRow) throw new HttpError(400, 'Código inválido.');
    if (codeRow.usedAt) throw new HttpError(400, 'Código já utilizado.');
    if (codeRow.expiresAt.getTime() < Date.now()) throw new HttpError(400, 'Código expirado.');
    if (codeRow.origin !== body.origin) throw new HttpError(403, 'Origem incompatível (CSRF).');
    // Verifica PKCE
    const { sha256Hex } = await import('@mants/auth');
    if (sha256Hex(body.codeVerifier) !== codeRow.codeChallenge) {
      throw new HttpError(403, 'PKCE inválido (replay/CSRF).');
    }
    const token = signSession(
      { sub: codeRow.userId, org: codeRow.organizationId, roles: ['organization_owner'], deviceId: body.deviceId, ext: true },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    const tokenHash = sha256Hex(token);
    await db.insert(schema.extensionSessions).values({
      userId: codeRow.userId,
      organizationId: codeRow.organizationId,
      deviceId: body.deviceId,
      tokenHash,
      expiresAt: new Date(Date.now() + getServerConfig().sessionTtlSeconds * 1000),
    });
    await db.update(schema.authCodes).set({ usedAt: new Date() }).where(eq(schema.authCodes.code, body.code));
    return json({ token, expiresIn: getServerConfig().sessionTtlSeconds });
  } catch (e) {
    return errorResponse(e);
  }
}

export { generatePkce };
