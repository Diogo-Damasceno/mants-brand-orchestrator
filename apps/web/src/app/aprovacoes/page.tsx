'use client';
import { useState } from 'react';
import { useToken } from '@/lib/client/api';

const CHECKLIST = [
  'Logotipo correto',
  'Cores corretas',
  'Tipografia compatível',
  'Ortografia',
  'Tom da marca',
  'Informações verificadas',
  'Formato correto',
  'Margens corretas',
  'Direitos confirmados',
  'CTA correto',
  'Aprovação final',
];

export default function AprovacoesPage() {
  const token = useToken();
  const [resultId, setResultId] = useState('');
  const [decision, setDecision] = useState<'approved' | 'changes_requested'>('approved');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setMsg('Enviando…');
    const res = await fetch('/api/workflow/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resultId, decision, comment }),
    });
    const data = await res.json();
    setMsg(res.ok ? 'Decisão registrada.' : data.error ?? 'Falha.');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Aprovações</h1>
      <ul className="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-400">
        {CHECKLIST.map((c) => (
          <li key={c}>☐ {c}</li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <input className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="ID do resultado" value={resultId} onChange={(e) => setResultId(e.target.value)} />
        <select className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" value={decision} onChange={(e) => setDecision(e.target.value as 'approved' | 'changes_requested')}>
          <option value="approved">Aprovar</option>
          <option value="changes_requested">Solicitar ajustes</option>
        </select>
        <textarea className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" rows={3} placeholder="Comentário" value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="rounded-md bg-brand px-4 py-2 font-semibold text-slate-900">Registrar decisão</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}
