import { CommercialNotice } from '@/components/marketing';
import { COMMERCIAL_DISCLAIMERS, PLUS_PROHIBITED_CLAIMS } from '@mants/shared-types';

export default function PrecosPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Planos e preços</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {COMMERCIAL_DISCLAIMERS.pricingIndependent}
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {([
          ['Básico', 'R$ 49/mês', ['1 Brand Kit', '1 usuário', 'Biblioteca limitada', 'Templates essenciais', 'Limite mensal de Pacotes', 'Histórico reduzido']],
          ['Profissional', 'R$ 149/mês', ['Múltiplos Brand Kits', 'Mais usuários', 'Mais armazenamento', 'Todos os templates', 'Aprovações', 'Versionamento']],
          ['Agência', 'R$ 399/mês', ['Múltiplos clientes', 'Equipe e permissões', 'White-label', 'Templates personalizados', 'Relatórios', 'Suporte prioritário']],
        ] as [string, string, string[]][]).map(([name, price, feats]) => (
          <div key={name} className="rounded-xl border border-slate-200 p-6 dark:border-slate-800">
            <h2 className="font-semibold">{name}</h2>
            <p className="mt-1 text-2xl font-bold">{price}</p>
            <ul className="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-400">
              {(feats as string[]).map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <CommercialNotice variant="chatgpt" />
      </div>
      <p className="mt-6 text-xs text-slate-500">
        Não cobramos por tokens. Limites por Brand Kits, usuários, clientes, armazenamento, pacotes mensais, retenção e templates personalizados.
      </p>
      <p className="mt-4 text-xs text-slate-500">
        Afirmações que NÃO fazemos sobre o ChatGPT Plus: {PLUS_PROHIBITED_CLAIMS.join('; ')}.
      </p>
    </div>
  );
}
