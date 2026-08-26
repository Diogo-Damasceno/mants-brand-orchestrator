'use client';
import { useResource } from '@/lib/client/api';

export default function ClientesPage() {
  const { data, error, loading } = useResource<{ clients: { id: string; name: string; industry?: string }[] }>('/api/clients');
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Clientes</h1>
      {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <ul className="mt-6 space-y-2">
        {data?.clients?.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="font-medium">{c.name}</span>
            {c.industry && <span className="ml-2 text-sm text-slate-500">{c.industry}</span>}
          </li>
        ))}
        {data && data.clients.length === 0 && <li className="text-sm text-slate-500">Nenhum cliente cadastrado.</li>}
      </ul>
    </div>
  );
}
