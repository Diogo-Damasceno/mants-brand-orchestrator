import { PLANS } from '@mants/billing';
import { CommercialNotice } from '@/components/marketing';
import { COMMERCIAL_DISCLAIMERS, PLUS_PROHIBITED_CLAIMS } from '@mants/shared-types';

export default function PlanoPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Plano e cobrança</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{COMMERCIAL_DISCLAIMERS.pricingIndependent}</p>
      <ul className="mt-6 space-y-3">
        {PLANS.map((p) => (
          <li key={p.tier} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className="text-sm text-slate-500">R$ {p.priceBRLMonthly}/mês</span>
            </div>
            <ul className="mt-2 list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <CommercialNotice variant="chatgpt" />
      </div>
      <p className="mt-4 text-xs text-slate-500">Não afirmamos sobre o ChatGPT Plus: {PLUS_PROHIBITED_CLAIMS.join('; ')}.</p>
    </div>
  );
}
