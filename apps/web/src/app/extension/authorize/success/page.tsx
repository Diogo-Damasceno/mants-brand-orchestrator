'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Tela de sucesso da autorização da extensão.
 * NÃO exibe código, token, state ou nonce. Não coloca token na query string.
 * Remove o código da URL (history.replaceState) após o processamento.
 */
export default function ExtensionAuthorizeSuccessPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg p-6"><p>Carregando…</p></main>}>
      <ExtensionAuthorizeSuccessInner />
    </Suspense>
  );
}

function ExtensionAuthorizeSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Remove o código da URL para não deixá-lo no histórico/compartilhamento.
    if (params.get('code')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    }
  }, [params]);

  return (
    <main className="mx-auto mt-20 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 text-center dark:border-slate-800">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-950">
        ✓
      </div>
      <h1 className="font-serif text-2xl font-bold">Autorização concluída</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Seu dispositivo foi autorizado com sucesso. Você já pode retornar à extensão do Mants
        Brand Orchestrator e usar o painel lateral.
      </p>
      <p className="text-xs text-slate-500">
        Esta aba pode ser fechada com segurança. Nenhum token ou código sensível é exibido aqui.
      </p>
      <button
        className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900"
        onClick={() => window.close()}
      >
        Fechar aba
      </button>
      <button
        className="w-full rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700"
        onClick={() => router.push('/dashboard')}
      >
        Ir para o dashboard
      </button>
    </main>
  );
}
