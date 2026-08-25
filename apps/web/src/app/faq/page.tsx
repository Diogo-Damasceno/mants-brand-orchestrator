import { CommercialNotice } from '@/components/marketing';

const FAQ = [
  ['Preciso assinar o ChatGPT?', 'A Mants Brand Orchestrator organiza o branding e prepara os materiais, mas não inclui acesso ao ChatGPT. Você deverá utilizar sua própria conta compatível.'],
  ['O ChatGPT Plus está incluído?', 'Não. As assinaturas da Mants e do ChatGPT são independentes.'],
  ['A Mants pertence à OpenAI?', 'Não. A Mants Brand Orchestrator é um produto independente da Mants Company.'],
  ['A extensão acessa minha senha?', 'Não. Ela não solicita nem armazena senha, cookie ou token do ChatGPT.'],
  ['A extensão envia mensagens sozinha?', 'Não. O usuário revisa o conteúdo e controla o envio.'],
  ['A extensão sempre conseguirá inserir o prompt?', 'A cópia do prompt e o Pacote Criativo são os recursos principais. A inserção assistida depende da compatibilidade com a interface atual e pode ser desativada.'],
  ['O resultado é garantido?', 'Não. Conteúdo gerado por IA deve ser revisado, especialmente logotipo, textos, preços, datas e informações legais.'],
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Perguntas frequentes</h1>
      <dl className="mt-6 space-y-4">
        {FAQ.map(([q, a]) => (
          <div key={q} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <dt className="font-semibold">{q}</dt>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">{a}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8">
        <CommercialNotice />
      </div>
    </div>
  );
}
