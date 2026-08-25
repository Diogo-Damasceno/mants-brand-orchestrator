import { NextRequest, NextResponse } from 'next/server';
import { getServerConfig } from '@mants/config';
import { verifySession, type SessionClaims } from '@mants/auth';
import { SESSION_COOKIE } from './session';

export interface RequestCtx {
  claims: SessionClaims;
  organizationId: string;
  userId: string;
  roles: SessionClaims['roles'];
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Autentica a requisição.
 * Web: cookie HttpOnly (mants_session). Extensão: Bearer token.
 * NUNCA confia em organization_id vindo do body como autorização.
 */
export async function authenticate(req: NextRequest): Promise<RequestCtx> {
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  }
  if (!token) throw new HttpError(401, 'Não autenticado.');
  const claims = verifySession(token, getServerConfig().authSecret);
  if (!claims) throw new HttpError(401, 'Sessão inválida ou expirada.');

  // Para tokens de extensão, exige sessão ativa no banco (revogação efetiva).
  if (claims.ext) {
    const { getDb, schema } = await import('@mants/database');
    const { eq, and } = await import('drizzle-orm');
    const { hashSessionToken } = await import('@mants/auth');
    const [sess] = await getDb()
      .select()
      .from(schema.extensionSessions)
      .where(
        and(
          eq(schema.extensionSessions.tokenHash, hashSessionToken(token)),
          eq(schema.extensionSessions.userId, claims.sub),
          eq(schema.extensionSessions.organizationId, claims.org),
          eq(schema.extensionSessions.status, 'active'),
        ),
      );
    if (!sess) throw new HttpError(401, 'Sessão de extensão revogada ou inexistente.');
  }

  return {
    claims,
    organizationId: claims.org,
    userId: claims.sub,
    roles: claims.roles,
  };
}

export function isPlatformAdmin(ctx: RequestCtx): boolean {
  return ctx.roles.includes('platform_admin');
}

/**
 * Define o contexto RLS no Postgres via SET LOCAL (parametrizado, sem concatenação).
 * Usa set_config com $1,$2,$3 para evitar injeção de SQL.
 */
export async function withTenant(pool: { query: (t: string, v?: unknown[]) => Promise<unknown> }, ctx: RequestCtx) {
  await pool.query('SELECT set_config($1, $2, true)', ['app.current_organization', ctx.organizationId]);
  await pool.query('SELECT set_config($1, $2, true)', ['app.current_user', ctx.userId]);
  await pool.query('SELECT set_config($1, $2, true)', ['app.is_platform_admin', String(isPlatformAdmin(ctx))]);
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('Erro não tratado:', err);
  return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
}
