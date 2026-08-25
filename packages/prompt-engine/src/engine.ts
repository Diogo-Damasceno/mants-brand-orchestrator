import type {
  BrandKitSnapshot,
  SelectedAsset,
  PromptMode,
  PromptTemplateKind,
} from '@mants/shared-types';
import { getTemplate } from './templates.js';
import { hashPrompt } from './hash.js';

export interface GeneratePromptInput {
  brandKit: BrandKitSnapshot;
  templateKind: PromptTemplateKind;
  mode: PromptMode;
  campaign?: {
    name?: string;
    objective?: string;
    productOrService?: string;
    audience?: string;
    channel?: string;
    format?: string;
    dimensions?: string;
    offer?: string;
    cta?: string;
    date?: string;
    tone?: string;
    mandatoryContent?: string[];
    prohibitedContent?: string[];
    references?: string[];
  };
  /** Campos que sobrescrevem o briefing da campanha (lado da extensão). */
  overrides?: {
    objective?: string;
    productOrService?: string;
    audience?: string;
    offer?: string;
    cta?: string;
    mandatoryContent?: string[];
    prohibitedContent?: string[];
  };
  selectedAssets: SelectedAsset[];
  variations: number;
  creatorId: string;
  createdBy: string;
}

export interface GeneratedPrompt {
  id: string;
  originalText: string;
  summarizedText: string;
  mode: PromptMode;
  sections: Record<string, string>;
  version: number;
  hash: string;
  createdAt: string;
}

function joinLines(values?: string[]): string {
  if (!values || values.length === 0) return 'Nenhum item informado.';
  return values.map((v) => `- ${v}`).join('\n');
}

function listOrNone(values?: string[], fallback = 'Nenhuma informação.'): string {
  if (!values || values.length === 0) return fallback;
  return values.join(', ');
}

function brandColorLines(kit: BrandKitSnapshot): string {
  const primary = kit.colors.filter((c) => c.role === 'primary');
  const secondary = kit.colors.filter((c) => c.role === 'secondary');
  const prohibited = kit.colors.filter((c) => c.role === 'prohibited');
  const lines: string[] = [];
  if (primary.length) lines.push('Principais: ' + primary.map((c) => `${c.name} (${c.hex})`).join(', '));
  if (secondary.length)
    lines.push('Secundárias: ' + secondary.map((c) => `${c.name} (${c.hex})`).join(', '));
  if (prohibited.length)
    lines.push('Proibidas: ' + prohibited.map((c) => `${c.name} (${c.hex})`).join(', '));
  return lines.length ? lines.join('\n') : 'Nenhuma cor cadastrada.';
}

function brandFontLines(kit: BrandKitSnapshot): string {
  const primary = kit.fonts.filter((f) => f.functionRole === 'primary');
  const secondary = kit.fonts.filter((f) => f.functionRole === 'secondary');
  const lines: string[] = [];
  if (primary.length) lines.push('Principais: ' + primary.map((f) => `${f.family} (${f.weight})`).join(', '));
  if (secondary.length)
    lines.push('Secundárias: ' + secondary.map((f) => `${f.family} (${f.weight})`).join(', '));
  return lines.length ? lines.join('\n') : 'Nenhuma tipografia cadastrada.';
}

function assetLines(assets: SelectedAsset[]): string {
  if (assets.length === 0) return 'Nenhum ativo anexado. O usuário deverá anexar manualmente os arquivos selecionados no ChatGPT.';
  return assets
    .map((a) => `- ${a.originalName} [${a.mimeType}]${a.commercialRightsConfirmed ? ' (direitos confirmados)' : ' (SEM direitos confirmados)'}`)
    .join('\n');
}

const MANDATORY_RULES: string[] = [
  'Não redesenhar o logotipo.',
  'Não distorcer o logotipo.',
  'Não modificar as proporções do logotipo.',
  'Não alterar cores da marca sem autorização.',
  'Não inventar promoções, preços, datas, endereços ou informações legais.',
  'Manter o português do Brasil.',
  'Respeitar margens e áreas seguras.',
  'Usar somente ativos autorizados e anexados.',
  'Gerar a quantidade de variações pedida.',
  'Entregar checklist e solicitar revisão humana final.',
];

const MODE_RULES: Record<PromptMode, string> = {
  essential:
    'Modo essencial: entregue prompt curto, com identidade, objetivo, formato e restrições principais.',
  professional:
    'Modo profissional: entregue prompt completo com contexto, público, tom, direção visual, ativos e checklist.',
  strict_branding:
    'Modo branding estrito: não permitir novas cores, fontes, alterações de logotipo ou elementos fora do Brand Kit.',
  creative_exploration:
    'Modo exploração criativa: explore composições, mantendo os elementos essenciais da identidade.',
};

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => (l ? `   ${l}` : l))
    .join('\n');
}

export function buildPromptSections(input: GeneratePromptInput): Record<string, string> {
  const kit = input.brandKit;
  const tpl = getTemplate(input.templateKind);
  const campaign = input.campaign ?? {};
  const ov = input.overrides ?? {};

  const objective = ov.objective ?? campaign.objective ?? '';
  const productOrService = ov.productOrService ?? campaign.productOrService ?? '';
  const audience = ov.audience ?? campaign.audience ?? kit.targetAudience ?? '';
  const offer = ov.offer ?? campaign.offer ?? '';
  const cta = ov.cta ?? campaign.cta ?? listOrNone(kit.approvedCtas, 'Definir CTA conforme a marca.');
  const mandatory = ov.mandatoryContent ?? campaign.mandatoryContent ?? [];
  const prohibited = ov.prohibitedContent ?? campaign.prohibitedContent ?? [];
  const tone = campaign.tone ?? kit.toneOfVoice ?? '';
  const format = campaign.format ?? '';
  const dimensions = campaign.dimensions ?? '';
  const channel = campaign.channel ?? '';
  const references = campaign.references ?? [];

  const modeSpecific = (tpl.modeRestrictions[input.mode] ?? []).concat(MODE_RULES[input.mode]);

  const sections: Record<string, string> = {
    '1. PAPEL':
      'Você é um diretor de arte e redator que segue rigorosamente a identidade visual e o tom de voz da marca descrita abaixo. Não improvise fora das diretrizes.',
    '2. OBJETIVO': objective || 'Não informado. Pergunte ao usuário ou mantenha alinhado ao propósito da marca.',
    '3. CONTEXTO DA MARCA': [
      `Marca: ${kit.name}`,
      kit.description ? `Descrição: ${kit.description}` : '',
      kit.segment ? `Segmento: ${kit.segment}` : '',
      kit.personality ? `Personalidade: ${kit.personality}` : '',
      kit.mission ? `Missão: ${kit.mission}` : '',
      kit.values ? `Valores: ${kit.values}` : '',
      kit.slogan ? `Slogan: ${kit.slogan}` : '',
      kit.productsAndServices ? `Produtos e serviços: ${kit.productsAndServices}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    '4. PÚBLICO': audience || 'Público não informado.',
    '5. TOM DE VOZ': [
      tone ? `Tom: ${tone}` : '',
      kit.recommendedWords?.length
        ? `Palavras recomendadas: ${kit.recommendedWords.join(', ')}`
        : '',
      kit.prohibitedWords?.length
        ? `Palavras proibidas: ${kit.prohibitedWords.join(', ')}`
        : '',
      kit.brandExpressions?.length
        ? `Expressões da marca: ${kit.brandExpressions.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    '6. IDENTIDADE VISUAL': [
      `Cores:\n${indent(brandColorLines(kit))}`,
      `Tipografias:\n${indent(brandFontLines(kit))}`,
      kit.hierarchyRules ? `Hierarquia: ${kit.hierarchyRules}` : '',
      kit.usageRules ? `Regras de uso: ${kit.usageRules}` : '',
      kit.restrictions ? `Restrições: ${kit.restrictions}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    '7. ATIVOS ANEXADOS': assetLines(input.selectedAssets),
    '8. FORMATO E DIMENSÕES': [
      format ? `Formato: ${format}` : '',
      dimensions ? `Dimensões: ${dimensions}` : '',
      channel ? `Canal: ${channel}` : '',
      `Variações solicitadas: ${input.variations}`,
    ]
      .filter(Boolean)
      .join('\n'),
    '9. CONTEÚDO OBRIGATÓRIO': joinLines(mandatory.length ? mandatory : undefined) +
      (productOrService ? `\n- Produto/serviço: ${productOrService}` : '') +
      (offer ? `\n- Oferta: ${offer}` : '') +
      (cta ? `\n- CTA: ${cta}` : ''),
    '10. RESTRIÇÕES': joinLines([
      ...MANDATORY_RULES,
      ...(prohibited.length ? [`Conteúdo proibido pela marca: ${prohibited.join('; ')}`] : []),
      ...modeSpecific,
    ]),
    '11. TAREFA': tpl.task,
    '12. FORMATO DA RESPOSTA':
      'Apresente: (a) direção de arte; (b) texto/legenda; (c) justificativas das decisões; (d) checklist de conformidade com a marca; (e) pedido de revisão humana.',
    '13. CHECKLIST': joinLines([
      'Logotipo correto e sem distorção.',
      'Cores da marca aplicadas.',
      'Tipografia compatível.',
      'Ortografia revisada.',
      'Tom da marca respeitado.',
      'Informações verificadas (sem invenções).',
      'Formato e margens corretos.',
      'Direitos de uso confirmados.',
      'CTA correto.',
    ]),
  };

  if (references.length) {
    sections['3. CONTEXTO DA MARCA'] += `\nReferências: ${references.join(', ')}`;
  }
  return sections;
}

export function renderPrompt(sections: Record<string, string>): string {
  const prefix = 'Você é um assistente de orquestração de marca. Siga rigorosamente as seções abaixo.\n';
  return prefix + Object.entries(sections).map(([k, v]) => `${k}\n${v}`).join('\n\n');
}

function summarize(text: string, maxChars = 900): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf('\n');
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut) + '\n… (versão resumida)';
}

export async function generatePrompt(input: GeneratePromptInput): Promise<GeneratedPrompt> {
  const sections = buildPromptSections(input);
  const full = renderPrompt(sections);
  const id = cryptoRandomId();
  const hash = await hashPrompt({
    brandKitId: input.brandKit.id,
    mode: input.mode,
    text: full,
    assets: input.selectedAssets.map((a) => a.id),
    variations: input.variations,
  });
  return {
    id,
    originalText: full,
    summarizedText: summarize(full),
    mode: input.mode,
    sections,
    version: 1,
    hash,
    createdAt: new Date().toISOString(),
  };
}

/** ID determinístico-mente aleatório (não depende de estado de prompt). */
function cryptoRandomId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback simples (testes)
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export { hashPrompt };
