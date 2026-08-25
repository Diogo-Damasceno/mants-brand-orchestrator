'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';

export default function AtivosPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState('');
  const [msg, setMsg] = useState('');

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setMsg('Enviando…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('meta', meta);
    try {
      const res = await apiFetch<{ id: string }>('/api/assets/upload', { method: 'POST', body: fd });
      setMsg(res.id ? 'Enviado.' : 'Falha.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha.');
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
      <h1 className="font-serif text-2xl font-bold">Ativos</h1>
      <form onSubmit={onUpload} className="space-y-3">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <textarea
          placeholder='Metadados JSON: {"clientId":"...","brandKitId":"...","orientation":"square","commercialRightsConfirmed":true}'
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <button className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900">Enviar</button>
      </form>
      {msg && <p className="text-sm">{msg}</p>}
    </main>
  );
}
