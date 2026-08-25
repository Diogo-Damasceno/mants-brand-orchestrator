'use client';
import { useState } from 'react';
import { useToken } from '@/lib/client/api';

export default function ResultadosPage() {
  const token = useToken();
  const [campaignId, setCampaignId] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setMsg('Importando…');
    const res = await fetch('/api/workflow/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ campaignId, textContent: text, status: 'submitted', version: 1 }),
    });
    const data = await res.json();
    setMsg(res.ok ? 'Resultado importado.' : data.error ?? 'Falha.');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Resultados</h1>
      <p className="mt-2 text-sm text-slate-500">
        Importe manualmente o resultado gerado no ChatGPT (colagem de texto ou observações). A plataforma não captura conversas automaticamente.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <input className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="ID da campanha" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
        <textarea className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" rows={6} placeholder="Texto/colagem do resultado" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="rounded-md bg-brand px-4 py-2 font-semibold text-slate-900">Importar resultado</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}
