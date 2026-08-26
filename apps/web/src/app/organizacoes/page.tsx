'use client';
import { useResource } from '@/lib/client/api';

export default function OrganizacoesPage() {
  const { data, error, loading } = useResource<{ organizations: { id: string; name: string; slug: string; role: string }[] }>('/api/organizations');
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Organizações</h1>
      {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <ul className="mt-6 space-y-2">
        {data?.organizations?.map((o) => (
          <li key={o.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="font-medium">{o.name}</span>
            <span className="ml-2 text-sm text-slate-500">@{o.slug}</span>
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{o.role}</span>
          </li>
        ))}
        {data && data.organizations.length === 0 && <li className="text-sm text-slate-500">Nenhuma organização.</li>}
      </ul>
    </div>
  );
}
