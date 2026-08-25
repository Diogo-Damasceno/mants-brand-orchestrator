'use client';
import { useResource } from '@/lib/client/api';

export default function AdminPage() {
  const { data, error, loading } = useResource<{ organizations: number; users: number; extensionSessions: unknown[] }>('/api/admin');
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Administração da plataforma</h1>
      {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {data && (
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <dt className="text-sm text-slate-500">Organizações</dt>
            <dd className="text-2xl font-bold">{data.organizations}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <dt className="text-sm text-slate-500">Usuários</dt>
            <dd className="text-2xl font-bold">{data.users}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <dt className="text-sm text-slate-500">Sessões de extensão</dt>
            <dd className="text-2xl font-bold">{data.extensionSessions.length}</dd>
          </div>
        </dl>
      )}
      <p className="mt-6 text-sm text-slate-500">
        Use a API POST /api/admin/revoke-extension para revogar sessões remotamente em caso de incidente.
      </p>
    </div>
  );
}
