import { NextResponse } from 'next/server';
import { getServerConfig } from '@mants/config';

export const SESSION_COOKIE = 'mants_session';

/**
 * Define o cookie de sessão web como HttpOnly + SameSite=Lax.
 * Em produção exige Secure. O token é um JWT HMAC assinado pela Mants.
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  const cfg = getServerConfig();
  const isProd = cfg.nodeEnv === 'production';
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.sessionTtlSeconds,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: getServerConfig().nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
