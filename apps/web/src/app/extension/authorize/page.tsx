'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client/api';

interface CodeMeta {
  code: string;
  extensionName: string;
  browser: string;
  deviceId: string;
  origin: string;
  authorized: boolean;
}

export default function ExtensionAuthorizePage() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') ?? '';
  const [meta, setMeta] = useState<CodeMeta | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('Código de autorização ausente.');
      setLoading(false);
      return;
    }
    apiGet<CodeMeta>(`/api/extension/auth/authorize?code=${encodeURIComponent(code)}`)
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [code]);

  async function onAuthorize() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/extension/auth/authorize', { code });
      router.push(`/extension/authorize/success?code=${encodeURIComponent(code)}`);
    } catch (e) {
      router.push(
        `/extension/authorize/error?message=${encodeURIComponent(e instanceof Error ? e.message : 'Erro')}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/extension/auth/cancel', { code });
      router.push(`/extension/authorize/cancelled?code=${encodeURIComponent(code)}`);
    } catch (e) {
      // Mesmo em erro de cancelamento, mostramos a tela de cancelamento.
      router.push(`/extension/authorize/cancelled?code=${encodeURIComponent(code)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="mx-auto mt-20 max-w-md p-6">Carregando…</main>;
  if (error) return <main className="mx-auto mt-20 max-w-md p-6 text-red-600">{error}</main>;
  if (!meta) return null;

  return (
    <main className="mx-auto mt-12 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
      <h1 className="font-serif text-2xl font-bold">Autorizar dispositivo</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        A extensão <strong>{meta.extensionName}</strong> solicita acesso à sua conta Mants.
      </p>
      <dl className="space-y-1 text-sm">
        <div><dt className="inline font-semibold">Navegador: </dt><dd className="inline">{meta.browser}</dd></div>
        <div><dt className="inline font-semibold">Dispositivo: </dt><dd className="inline">{meta.deviceId.slice(0, 12)}…</dd></div>
        <div><dt className="inline font-semibold">Origem: </dt><dd className="inline">{meta.origin}</dd></div>
      </dl>
      <p className="rounded bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        A Mants Brand Orchestrator <strong>não acessa suas credenciais do ChatGPT</strong>, não faz login automático
        e não lê suas conversas. Ela apenas prepara prompts e arquivos para você usar em sua conta própria.
      </p>
      <p className="text-xs text-slate-500">Permissões solicitadas: ler organizações, clientes, Brand Kits, campanhas e ativos; gerar prompts e pacotes criativos.</p>
      <div className="flex gap-3">
        <button className="flex-1 rounded-md bg-brand px-4 py-2 font-semibold text-slate-900" disabled={busy} onClick={onAuthorize}>
          {busy ? 'Autorizando…' : 'Autorizar'}
        </button>
        <button className="flex-1 rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </main>
  );
}
