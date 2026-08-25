import { CommercialNotice } from '@/components/marketing';

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Termos de uso</h1>
      <p className="mt-4">
        Modelo de termos de uso para a Mants Brand Orchestrator. Este texto é um modelo sujeito a
        revisão jurídica profissional antes da disponibilização comercial.
      </p>
      <h2 className="mt-6 font-semibold">Uso da conta</h2>
      <p>
        A Mants Brand Orchestrator não inclui acesso ao ChatGPT. O usuário deve possuir sua própria
        conta compatível do ChatGPT e é responsável pelo uso que fizer do serviço de terceiros.
      </p>
      <h2 className="mt-6 font-semibold">Propriedade intelectual</h2>
      <p>
        A Mants Brand Orchestrator é um produto independente da Mants Company, não afiliado à OpenAI.
        ChatGPT e OpenAI são marcas de seus respectivos proprietários.
      </p>
      <h2 className="mt-6 font-semibold">Responsabilidade sobre conteúdo</h2>
      <p>
        O usuário declara possuir autorização para utilizar e enviar os arquivos ao serviço de IA
        escolhido. A Mants não se responsabiliza por conteúdo gerado por ferramentas de terceiros.
      </p>
      <div className="mt-8">
        <CommercialNotice />
      </div>
    </div>
  );
}
