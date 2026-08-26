'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Tela de cancelamento da autorização da extensão.
 * Remove o código da URL após o processamento.
 */
export default function ExtensionAuthorizeCancelledPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get('code')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    }
  }, [params]);

  return (
    <main className="mx-auto mt-20 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 text-center dark:border-slate-800">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-950">
        ✕
      </div>
      <h1 className="font-serif text-2xl font-bold">Autorização cancelada</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        O dispositivo não foi autorizado. Nenhuma sessão foi criada. Você pode iniciar o login
        novamente pela extensão quando quiser.
      </p>
      <button
        className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900"
        onClick={() => window.close()}
      >
        Fechar aba
      </button>
      <button
        className="w-full rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700"
        onClick={() => router.push('/')}
      >
        Voltar ao início
      </button>
    </main>
  );
}
