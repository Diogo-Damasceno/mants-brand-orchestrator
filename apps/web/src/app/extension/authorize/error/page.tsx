'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/** Tela de erro do fluxo de autorização da extensão. */
export default function ExtensionAuthorizeError() {
  const params = useSearchParams();
  const router = useRouter();
  const message = params.get('message') ?? 'Ocorreu um erro durante a autorização.';

  useEffect(() => {
    if (params.get('code')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    }
  }, [params]);

  return (
    <main className="mx-auto mt-20 max-w-md space-y-4 rounded-xl border border-red-200 p-6 text-center dark:border-red-900">
      <div className="text-3xl">⚠</div>
      <h1 className="font-serif text-2xl font-bold">Não foi possível autorizar</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <p className="text-xs text-slate-500">
        Você pode tentar novamente na extensão. Nenhuma senha ou token foi solicitado.
      </p>
      <button
        className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        onClick={() => router.push('/')}
      >
        Voltar ao início
      </button>
    </main>
  );
}
