import { NextRequest, NextResponse } from 'next/server';
import { getServerConfig } from '@mants/config';
import { verifySession, type SessionClaims } from '@mants/auth';

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
 * Autentica a requisição via Bearer token (HMAC-SHA256 da Mants).
 * NUNCA confia em organization_id vindo do body como autorização.
 */
export function authenticate(req: NextRequest): RequestCtx {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado.');
  const token = auth.slice(7);
  const claims = verifySession(token, getServerConfig().authSecret);
  if (!claims) throw new HttpError(401, 'Sessão inválida ou expirada.');
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

/** Define o contexto RLS no Postgres via SET LOCAL antes de consultar. */
export async function withTenant(pool: { query: (t: string, v?: unknown[]) => Promise<unknown> }, ctx: RequestCtx) {
  await pool.query(`SET LOCAL app.current_organization = '${ctx.organizationId}'`);
  await pool.query(`SET LOCAL app.current_user = '${ctx.userId}'`);
  await pool.query(`SET LOCAL app.is_platform_admin = '${isPlatformAdmin(ctx)}'`);
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('Erro não tratado:', err);
  return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
}
