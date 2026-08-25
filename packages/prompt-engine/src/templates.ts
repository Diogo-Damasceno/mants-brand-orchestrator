import type { PromptTemplateKind, PromptMode } from '@mants/shared-types';

export interface PromptTemplateDef {
  kind: PromptTemplateKind;
  name: string;
  description: string;
  /** Texto da tarefa específica por tipo de peça. */
  task: string;
  /** Instruções extras de restrição conforme o modo. */
  modeRestrictions: Partial<Record<PromptMode, string[]>>;
}

/**
 * Templates determinísticos (sem LLM). Cada peça tem uma tarefa e regras
 * complementares. O motor monta as seções a partir destes textos.
 */
export const PROMPT_TEMPLATES: PromptTemplateDef[] = [
  {
    kind: 'post_instagram',
    name: 'Post Instagram',
    description: 'Conteúdo para feed do Instagram com foco em engajamento.',
    task: 'Crie a direção de arte e a legenda para um post de feed do Instagram, respeitando a identidade da marca e os ativos anexados.',
    modeRestrictions: {
      strict_branding: ['Mantenha exatamente as cores e tipografias do Brand Kit; não proponha novas.'],
      creative_exploration: ['Você pode propor composições e enquadramentos inéditos, desde que preserve logotipo, cores e tipografia.'],
    },
  },
  {
    kind: 'story',
    name: 'Story',
    description: 'Peça vertical efêmera para stories.',
    task: 'Crie a direção de arte e o roteiro de texto para um Story compatível com a identidade da marca.',
    modeRestrictions: {
      strict_branding: ['Use exclusivamente a paleta e a tipografia aprovadas no Brand Kit.'],
      creative_exploration: ['Explore transições e camadas criativas, preservando os elementos essenciais da marca.'],
    },
  },
  {
    kind: 'carousel',
    name: 'Carrossel',
    description: 'Sequência de slides com narrative.',
    task: 'Estruture um carrossel de até 10 slides, com progressão lógica e consistência visual conforme o Brand Kit.',
    modeRestrictions: {
      strict_branding: ['Cada slide deve obedecer às mesmas cores, fontes e logotipo do Brand Kit.'],
      creative_exploration: ['Varie a composição entre os slides, mantendo a coerência da marca.'],
    },
  },
  {
    kind: 'banner',
    name: 'Banner',
    description: 'Peça de display ou cabeçalho.',
    task: 'Crie a direção de arte para um banner respeitando as áreas seguras e o formato informado.',
    modeRestrictions: {
      strict_branding: ['Não altere proporções do logotipo nem cores da marca.'],
      creative_exploration: ['Experimente disposição dos elementos, mas sem descaracterizar a marca.'],
    },
  },
  {
    kind: 'ad',
    name: 'Anúncio',
    description: 'Peça de mídia paga.',
    task: 'Elabore a direção de arte e o texto de um anúncio focado em conversão, com CTA claro.',
    modeRestrictions: {
      strict_branding: ['Aplicações de marca devem ser idênticas às do Brand Kit.'],
      creative_exploration: ['Teste abordagens de apelo, preservando identidade.'],
    },
  },
  {
    kind: 'promo_campaign',
    name: 'Campanha promocional',
    description: 'Conjunto promocional.',
    task: 'Crie a direção de arte e os textos de uma campanha promocional coesa.',
    modeRestrictions: {
      strict_branding: ['Nenhuma cor, fonte ou logotipo fora do Brand Kit.'],
      creative_exploration: ['Proponha ângulos promocionais distintos respeitando a marca.'],
    },
  },
  {
    kind: 'launch',
    name: 'Lançamento',
    description: 'Peça de lançamento de produto/serviço.',
    task: 'Desenvolva a direção de arte e o narrativa de lançamento com impacto.',
    modeRestrictions: {
      strict_branding: ['Use somente a identidade aprovada.'],
      creative_exploration: ['Explore conceitos de revelação mantendo a marca.'],
    },
  },
  {
    kind: 'institutional',
    name: 'Conteúdo institucional',
    description: 'Comunicação institucional.',
    task: 'Produza a direção de arte e o texto institucional alinhados à missão e valores.',
    modeRestrictions: {
      strict_branding: ['Mantenha tom, cores e fontes do Brand Kit.'],
      creative_exploration: ['Aborde o tema sob diferentes perspectivas mantendo coerência.'],
    },
  },
  {
    kind: 'holiday',
    name: 'Data comemorativa',
    description: 'Peça sazonal.',
    task: 'Crie a direção de arte para uma data comemorativa respeitando a marca.',
    modeRestrictions: {
      strict_branding: ['Adapte-se à ocasião sem romper a identidade.'],
      creative_exploration: ['Proponha temas festivos dentro das diretrizes da marca.'],
    },
  },
  {
    kind: 'caption',
    name: 'Legenda',
    description: 'Texto de legenda.',
    task: 'Escreva a legenda otimizada para a rede informada, no tom da marca.',
    modeRestrictions: {
      strict_branding: ['Use vocabulário e tom aprovados no Brand Kit.'],
      creative_exploration: ['Varie o gancho de abertura preservando a voz da marca.'],
    },
  },
  {
    kind: 'copy',
    name: 'Copy',
    description: 'Texto publicitário.',
    task: 'Redige o copy publicitário com foco no objetivo e no público.',
    modeRestrictions: {
      strict_branding: ['Adote as palavras recomendadas e evite as proibidas.'],
      creative_exploration: ['Teste diferentes abordagens de copy dentro do tom.'],
    },
  },
  {
    kind: 'visual_direction',
    name: 'Direção visual',
    description: 'Briefing de direção de arte.',
    task: 'Gere um briefing de direção visual detalhado com referências de composição.',
    modeRestrictions: {
      strict_branding: ['Toda direção deve espelhar o Brand Kit.'],
      creative_exploration: ['Sugira variações de direção mantendo a essência.'],
    },
  },
  {
    kind: 'artwork_variation',
    name: 'Variação de arte existente',
    description: 'Variação de peça aprovada.',
    task: 'Crie variações de uma arte existente mantendo consistência com a peça de referência.',
    modeRestrictions: {
      strict_branding: ['As variações devem ser fiéis à arte e ao Brand Kit.'],
      creative_exploration: ['Explore variações de layout e cor dentro da identidade.'],
    },
  },
];

export function getTemplate(kind: PromptTemplateKind): PromptTemplateDef {
  const found = PROMPT_TEMPLATES.find((t) => t.kind === kind);
  if (found) return found;
  return PROMPT_TEMPLATES[0]!;
}
