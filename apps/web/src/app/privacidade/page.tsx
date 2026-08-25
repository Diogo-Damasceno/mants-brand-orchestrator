import { CommercialNotice } from '@/components/marketing';

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Política de privacidade</h1>
      <p className="mt-4">
        Modelo de política de privacidade (LGPD) para a Mants Brand Orchestrator. Sujeito a revisão
        jurídica profissional.
      </p>
      <h2 className="mt-6 font-semibold">Controlador</h2>
      <p>Mants Company — dados de contato disponíveis em privacidade@mants.example.</p>
      <h2 className="mt-6 font-semibold">Dados tratados</h2>
      <p>
        Coletamos dados de conta, organizações, clientes, Brand Kits, ativos e histórico de uso
        necessários à operação. Não coletamos senhas, cookies ou tokens do ChatGPT.
      </p>
      <h2 className="mt-6 font-semibold">Processamento externo</h2>
      <p>
        Os arquivos e prompts podem ser enviados pelo usuário a serviços de IA de terceiros (ex.:
        ChatGPT) fora da plataforma Mants. Esse processamento ocorre sob responsabilidade do usuário
        e está sujeito aos termos do serviço terceiro.
      </p>
      <h2 className="mt-6 font-semibold">Direitos do titular</h2>
      <p>
        Garantimos exportação e exclusão de dados, retenção limitada e consentimento registrado.
        Solicitações: privacidade@mants.example.
      </p>
      <div className="mt-8">
        <CommercialNotice />
      </div>
    </div>
  );
}
