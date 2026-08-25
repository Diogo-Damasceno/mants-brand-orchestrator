import { CommercialNotice } from '@/components/marketing';

const RECURSOS = [
  'Organizações e isolamento completo entre empresas',
  'Clientes e Brand Kits com cores, fontes, tom de voz e regras',
  'Biblioteca de ativos com tags, busca, aprovação e versionamento',
  'Campanhas com briefing e status de workflow',
  'Gerador determinístico de prompts (sem LLM) com 13 templates e 4 modos',
  'Recomendação de ativos por regras (sem IA paga)',
  'Pacote Criativo em ZIP com manifesto e hashes SHA-256',
  'Extensão Chrome com painel lateral e integração assistida ao ChatGPT',
  'Histórico de campanhas e resultados',
  'Aprovação de peças com checklist e histórico imutável',
  'Planos Básico, Profissional e Agência',
  'Administração da plataforma e revogação de sessões',
];

export default function RecursosPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Recursos</h1>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {RECURSOS.map((r) => (
          <li key={r} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <CommercialNotice />
      </div>
    </div>
  );
}
