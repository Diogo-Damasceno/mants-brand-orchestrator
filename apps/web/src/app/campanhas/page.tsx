'use client';
import { useResource } from '@/lib/client/api';

export default function CampanhasPage() {
  const { data, error, loading } = useResource<{ campaigns: { id: string; name: string; status: string }[] }>('/api/campaigns');
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Campanhas</h1>
      {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <ul className="mt-6 space-y-2">
        {data?.campaigns?.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="font-medium">{c.name}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{c.status}</span>
          </li>
        ))}
        {data && data.campaigns.length === 0 && <li className="text-sm text-slate-500">Nenhuma campanha cadastrada.</li>}
      </ul>
    </div>
  );
}
