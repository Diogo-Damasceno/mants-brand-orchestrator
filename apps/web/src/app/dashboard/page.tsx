'use client';
import Link from 'next/link';
import { useResource } from '@/lib/client/api';

export default function DashboardPage() {
  const { data, error, loading } = useResource<{ user?: { name?: string }; organizations: unknown[] }>('/api/auth/me');
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Dashboard</h1>
      {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {data?.user && <p className="mt-2 text-slate-600 dark:text-slate-400">Olá, {data.user.name}.</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {([
          ['Clientes', '/clientes'],
          ['Brand Kits', '/brand-kits'],
          ['Campanhas', '/campanhas'],
          ['Biblioteca de ativos', '/ativos'],
          ['Resultados', '/resultados'],
          ['Aprovações', '/aprovacoes'],
          ['Organizações', '/organizacoes'],
          ['Plano e cobrança', '/plano'],
          ['Administração', '/admin'],
        ] as [string, string][]).map(([label, href]) => (
          <Link key={href} href={href} className="rounded-lg border border-slate-200 p-4 hover:border-brand dark:border-slate-800">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
