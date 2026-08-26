'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, useResource } from '@/lib/client/api';

interface CampaignOption {
  id: string;
  name: string;
}

/**
 * Importação manual de resultado gerado no ChatGPT.
 * Usa autenticação por cookie (apiPost) e posta no endpoint real /api/results.
 * A plataforma NÃO captura conversas automaticamente; é colagem explícita do usuário.
 */
export default function ResultadosImportarPage() {
  const router = useRouter();
  const { data } = useResource<{ campaigns: CampaignOption[] }>(
    '/api/campaigns',
  );
  const campaigns = data?.campaigns ?? [];
  const [campaignId, setCampaignId] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('Importando…');
    try {
      const res = await apiPost<{ id: string }>('/api/results', {
        campaignId,
        textContent: text,
        status: 'submitted',
        version: 1,
      });
      setMsg(`Resultado importado (${res.id.slice(0, 8)}).`);
      router.push('/resultados');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha ao importar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Importar resultado</h1>
      <p className="mt-2 text-sm text-slate-500">
        Cole o texto gerado no ChatGPT. A plataforma não captura conversas automaticamente.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
      >
        <select
          className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">— selecione a campanha (opcional) —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <textarea
          className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
          rows={8}
          placeholder="Texto/colagem do resultado"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="rounded-md bg-brand px-4 py-2 font-semibold text-slate-900"
          disabled={busy}
        >
          {busy ? 'Importando…' : 'Importar resultado'}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}
