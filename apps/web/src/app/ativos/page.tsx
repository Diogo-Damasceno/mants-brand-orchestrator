'use client';
import { useState } from 'react';
import { useToken } from '@/lib/client/api';

export default function AtivosPage() {
  const token = useToken();
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !token) return;
    setMsg('Enviando…');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/storage/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const data = await res.json();
    setMsg(res.ok ? 'Enviado.' : data.error ?? 'Falha.');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Biblioteca de ativos</h1>
      <form onSubmit={onUpload} className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="rounded-md bg-brand px-4 py-2 font-semibold text-slate-900">Enviar ativo</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
      <p className="mt-4 text-sm text-slate-500">
        Formatos: PNG, JPEG, WEBP, SVG sanitizado, PDF, WOFF2, TTF/OTF. Limite de 25 MB por arquivo.
      </p>
    </div>
  );
}
