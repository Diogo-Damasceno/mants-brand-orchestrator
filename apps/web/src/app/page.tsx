import { CommercialNotice, CtaButton } from '@/components/marketing';

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-16 text-center">
        <h1 className="font-serif text-4xl font-bold text-brand-deep dark:text-brand sm:text-5xl">
          Orquestre a marca da sua agência dentro do ChatGPT
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          A Mants Brand Orchestrator transforma a identidade visual de cada cliente em prompts
          estruturados e Pacotes Criativos prontos para usar na sua própria conta compatível do ChatGPT.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <CtaButton href="/cadastro">Começar gratuito</CtaButton>
          <CtaButton href="/como-funciona">Ver como funciona</CtaButton>
        </div>
        <div className="mx-auto mt-10 max-w-3xl">
          <CommercialNotice />
        </div>
      </section>

      <section className="grid gap-6 py-10 sm:grid-cols-3">
        {[
          ['Brand Kits completos', 'Cores, fontes, tom de voz, logotipos e regras de uso centralizados por cliente.'],
          ['Prompt determinístico', 'Motor sem LLM que monta prompts profissionais a partir do Brand Kit e do briefing.'],
          ['Pacote Criativo em ZIP', 'Prompt, contexto JSON, ativos e manifesto com hashes SHA-256 prontos para anexar.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{d}</p>
          </div>
        ))}
      </section>

      <section className="py-10">
        <h2 className="font-serif text-2xl font-semibold">O fluxo de trabalho</h2>
        <ol className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <li>1. Cadastre a agência e o cliente.</li>
          <li>2. Adicione logotipo, fontes, cores, público e tom de voz.</li>
          <li>3. Crie uma campanha e escolha o formato da peça.</li>
          <li>4. A plataforma gera um prompt profissional sem usar LLM.</li>
          <li>5. A extensão exibe o prompt ao lado do ChatGPT para copiar e anexar.</li>
        </ol>
      </section>
    </div>
  );
}
