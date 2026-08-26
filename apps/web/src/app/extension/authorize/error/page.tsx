'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Tela de erro da autorização da extensão.
 * Mostra mensagem genérica (sem expor código/token). Remove código da URL.
 */
export default function ExtensionAuthorizeErrorPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg p-6"><p>Carregando…</p></main>}>
      <ExtensionAuthorizeErrorInner />
    </Suspense>
  );
}

function ExtensionAuthorizeErrorInner() {
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
    <main className="mx-auto mt-20 max-w-md space-y-4 rounded-xl border border-red-200 p-6 text-center dark:border-red-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl dark:bg-red-950">
        !
      </div>
      <h1 className="font-serif text-2xl font-bold">Não foi possível autorizar</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Ocorreu um problema ao autorizar o dispositivo. Tente iniciar o login novamente pela
        extensão. Se o erro persistir, entre em contato com o suporte.
      </p>
      <button
        className="w-full rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700"
        onClick={() => window.close()}
      >
        Fechar aba
      </button>
      <button
        className="w-full rounded-md bg-brand px-4 py-2 font-semibold text-slate-900"
        onClick={() => router.push('/')}
      >
        Voltar ao início
      </button>
    </main>
  );
}
