import { CommercialNotice } from '@/components/marketing';

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-brand-deep dark:text-brand">Como funciona</h1>
      <ol className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <li>1. Uma agência cadastra o cliente.</li>
        <li>2. Adiciona logotipo, fontes, cores, público e tom de voz.</li>
        <li>3. Cria uma campanha.</li>
        <li>4. Escolhe o formato da peça.</li>
        <li>5. Seleciona imagens.</li>
        <li>6. A plataforma gera um prompt profissional (sem LLM).</li>
        <li>7. A extensão exibe esse prompt ao lado do ChatGPT.</li>
        <li>8. O usuário copia ou insere o prompt.</li>
        <li>9. Baixa ou acessa os arquivos selecionados.</li>
        <li>10. Anexa os arquivos manualmente ao ChatGPT.</li>
        <li>11. Confirma o envio.</li>
        <li>12. Importa o resultado para a plataforma.</li>
        <li>13. Envia o resultado para aprovação.</li>
      </ol>
      <div className="mt-8">
        <CommercialNotice />
      </div>
    </div>
  );
}
