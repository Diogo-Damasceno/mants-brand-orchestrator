import { NextResponse, type NextRequest } from 'next/server';

// Rotas públicas (não exigem sessão web via cookie).
// '/' é público APENAS por igualdade exata (todos os caminhos começam com '/').
const PUBLIC_EXACT = new Set(['/', '/login', '/cadastro', '/termos', '/privacidade', '/faq', '/precos', '/plano', '/como-funciona', '/recursos']);
// Prefixos públicos (não exigem sessão).
const PUBLIC_PREFIXES = [
  '/extension/authorize', // fluxo de autorização PKCE ocorre com cookie da sessão web, mas a tela é pública
  '/api/extension/auth/start',
  '/api/extension/auth/exchange',
  '/api/extension/auth/poll',
  '/api/extension/config',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/storage/file', // download assinado (autenticado por query string)
];

// Áreas protegidas (exigem sessão web via cookie).
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/clientes',
  '/brand-kits',
  '/campanhas',
  '/ativos',
  '/resultados',
  '/aprovacoes',
  '/organizacoes',
  '/configuracoes',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));
}

/**
 * Middleware de rotas protegidas (páginas).
 * Redireciona para /login quando o cookie de sessão (HttpOnly) está ausente.
 * Rota handlers sensíveis autenticam e autorizam INDEPENDENTEMENTE do middleware.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Apenas protege áreas conhecidas; o resto segue o fluxo normal.
  const isProtectedPage = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!isProtectedPage) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

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
  matcher: [
    '/dashboard/:path*',
    '/clientes/:path*',
    '/brand-kits/:path*',
    '/campanhas/:path*',
    '/ativos/:path*',
    '/resultados/:path*',
    '/aprovacoes/:path*',
    '/organizacoes/:path*',
    '/configuracoes/:path*',
  ],
};
