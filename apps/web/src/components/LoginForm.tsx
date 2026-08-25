'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falha ao entrar.');
      localStorage.setItem('mants_token', data.token);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-16 max-w-sm space-y-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
      <h1 className="font-serif text-2xl font-bold">Entrar</h1>
      <input className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
