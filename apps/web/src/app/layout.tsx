import './globals.css';
import type { Metadata } from 'next';
import { COMMERCIAL_DISCLAIMERS } from '@mants/shared-types';

export const metadata: Metadata = {
  title: 'Mants Brand Orchestrator',
  description:
    'Orquestração de branding para o ChatGPT: Brand Kits, prompts determinísticos e Pacotes Criativos prontos para sua conta compatível do ChatGPT.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <a href="/" className="font-serif text-xl font-semibold text-brand-deep dark:text-brand">
              Mants Brand Orchestrator
            </a>
            <nav className="flex gap-4 text-sm">
              <a href="/como-funciona" className="hover:text-brand">Como funciona</a>
              <a href="/recursos" className="hover:text-brand">Recursos</a>
              <a href="/precos" className="hover:text-brand">Preços</a>
              <a href="/faq" className="hover:text-brand">FAQ</a>
              <a href="/login" className="hover:text-brand">Entrar</a>
              <a href="/cadastro" className="rounded-md bg-brand px-3 py-1.5 font-medium text-slate-900">Cadastrar</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-16 border-t border-slate-200 px-4 py-8 text-xs text-slate-500 dark:border-slate-800">
          <div className="mx-auto max-w-6xl space-y-2">
            <p>{COMMERCIAL_DISCLAIMERS.notAffiliated}</p>
            <p>{COMMERCIAL_DISCLAIMERS.chatgptNotIncluded}</p>
            <p>
              <a href="/termos" className="underline">Termos de uso</a> ·{' '}
              <a href="/privacidade" className="underline">Política de privacidade</a>
            </p>
            <p>© {new Date().getFullYear()} Mants Company. Produto independente, não afiliado à OpenAI.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
