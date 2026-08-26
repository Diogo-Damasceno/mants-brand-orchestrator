'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/** Tela de cancelamento do fluxo de autorização da extensão. */
export default function ExtensionAuthorizeCancelled() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (params.get('code')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    }
  }, [params]);

  return (
    <main className="mx-auto mt-20 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 text-center dark:border-slate-800">
      <div className="text-3xl">✕</div>
      <h1 className="font-serif text-2xl font-bold">Autorização cancelada</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        O dispositivo não receberá acesso à sua conta Mants. Você pode fechar esta aba.
      </p>
      <button
        className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900"
        onClick={() => window.close()}
      >
        Fechar aba
      </button>
      <button
        className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        onClick={() => router.push('/')}
      >
        Voltar ao início
      </button>
    </main>
  );
}
