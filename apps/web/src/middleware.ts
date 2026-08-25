import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/extension/authorize', '/'];

/**
 * Middleware de rotas protegidas.
 * Redireciona para /login quando o cookie de sessão (HttpOnly) está ausente.
 * A verificação criptográfica da sessão ocorre nos Route Handlers (authenticate()).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has('mants_session');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/clients/:path*', '/brand-kits/:path*', '/campaigns/:path*', '/assets/:path*', '/results/:path*'],
};
