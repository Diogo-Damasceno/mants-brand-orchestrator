import { NextResponse, type NextRequest } from 'next/server';

// Públicas por igualdade exata. '/' é público SOMENTE por igualdade exata
// (o bug anterior usava startsWith('/'), que casava com tudo).
const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/register',
  '/cadastro',
  '/forgot-password',
  '/reset-password',
  '/extension/authorize',
  '/extension/authorize/success',
  '/extension/authorize/cancelled',
  '/extension/authorize/error',
]);

// Prefixos realmente públicos (marketing, termos, recurso estático, rotas de extensão).
const PUBLIC_PREFIXES = [
  '/como-funciona',
  '/recursos',
  '/precos',
  '/planos',
  '/plano',
  '/faq',
  '/termos',
  '/privacidade',
  '/extension/authorize',
  '/api/extension/config',
  '/api/extension/auth/start',
  '/api/extension/auth/authorize',
  '/api/extension/auth/exchange',
  '/api/extension/auth/cancel',
  '/api/extension/auth/status',
  '/_next',
  '/favicon',
];

/**
 * Middleware de rotas protegidas.
 * Redireciona para /login quando o cookie de sessão (HttpOnly) está ausente.
 * A verificação criptográfica da sessão ocorre nos Route Handlers (authenticate()).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

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
  // Rotas sensíveis em português + auth da web. Os Route Handlers também
  // autenticam/autorizam independentemente deste matcher.
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
    '/api/clients/:path*',
    '/api/brand-kits/:path*',
    '/api/campaigns/:path*',
    '/api/assets/:path*',
    '/api/prompts/:path*',
    '/api/packages/:path*',
    '/api/results/:path*',
    '/api/organizations/:path*',
    '/api/extension/session',
    '/api/extension/sessions/:path*',
    '/api/auth/me',
  ],
};
