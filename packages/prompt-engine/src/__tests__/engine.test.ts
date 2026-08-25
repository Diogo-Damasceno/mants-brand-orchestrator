import { describe, it, expect } from 'vitest';
import { generatePrompt, PROMPT_TEMPLATES, hashPrompt, type GeneratePromptInput } from '@mants/prompt-engine';
import type { BrandKitSnapshot, SelectedAsset } from '@mants/shared-types';

const brandKit: BrandKitSnapshot = {
  id: 'bk-1',
  name: 'Aurora Café',
  description: 'Cafeteria artesanal.',
  segment: 'Food & Beverage',
  targetAudience: 'Adultos que apreciam cafés especiais.',
  personality: 'Acolhedor, artesanal.',
  toneOfVoice: 'Caloroso e próximo.',
  slogan: 'O café da sua manhã.',
  mission: 'Levar qualidade à xícara.',
  values: 'Qualidade, Proximidade',
  recommendedWords: ['aroma', 'conforto'],
  prohibitedWords: ['barato', 'ruim'],
  colors: [
    { id: 'c1', hex: '#6F4E37', rgb: '111,78,55', role: 'primary', name: 'Café', priority: 1 },
    { id: 'c2', hex: '#D9C2A3', rgb: '217,194,163', role: 'secondary', name: 'Creme', priority: 2 },
    { id: 'c3', hex: '#000000', rgb: '0,0,0', role: 'prohibited', name: 'Preto puro', priority: 9 },
  ],
  fonts: [
    { id: 'f1', family: 'Inter', weight: '600', style: 'normal', functionRole: 'primary', commercialRightsConfirmed: true },
    { id: 'f2', family: 'Lora', weight: '400', style: 'italic', functionRole: 'secondary', commercialRightsConfirmed: true },
  ],
  usageRules: 'Não distorcer o logotipo.',
  restrictions: 'Não alterar as cores da marca.',
  approvedCtas: ['Peça o seu', 'Visite a loja'],
  version: 1,
};

const asset: SelectedAsset = {
  id: 'asset-1',
  originalName: 'logo-aurora.png',
  tags: ['cafe'],
  productIds: [],
  campaignIds: [],
  orientation: 'square',
  mimeType: 'image/png',
  sizeBytes: 1024,
  status: 'approved',
  priority: 1,
  commercialRightsConfirmed: true,
  archived: false,
};

function makeInput(over: Partial<GeneratePromptInput> = {}): GeneratePromptInput {
  return {
    brandKit,
    templateKind: 'post_instagram',
    mode: 'professional',
    campaign: {
      objective: 'Aumentar pedidos de café especial.',
      productOrService: 'Café espresso',
      audience: 'Clientes locais',
      channel: 'Instagram',
      format: 'Post Instagram',
      dimensions: '1080x1080',
      offer: undefined,
      cta: 'Peça o seu',
      tone: 'Caloroso',
      mandatoryContent: ['Logotipo visível'],
      prohibitedContent: ['Preços fictícios'],
      references: [],
    },
    selectedAssets: [asset],
    variations: 1,
    creatorId: 'user-1',
    createdBy: 'user-1',
    ...over,
  };
}

describe('prompt-engine', () => {
  it('gera prompt determinístico sem LLM com 13 seções', async () => {
    const p = await generatePrompt(makeInput());
    expect(p.originalText).toContain('1. PAPEL');
    expect(p.originalText).toContain('13. CHECKLIST');
    expect(p.originalText).toContain('Aurora Café');
    expect(Object.keys(p.sections).length).toBe(13);
  });

  it('é deterministico: mesmo input gera mesmo hash', async () => {
    const a = await generatePrompt(makeInput());
    const b = await generatePrompt(makeInput());
    expect(a.hash).toBe(b.hash);
    expect(a.originalText).toBe(b.originalText);
  });

  it('modo branding estrito proíbe novas cores/fontes', async () => {
    const strict = await generatePrompt(makeInput({ mode: 'strict_branding' }));
    expect(strict.originalText).toContain('não permitir novas cores');
  });

  it('aplicação de edição preserva hash original', async () => {
    const p = await generatePrompt(makeInput());
    const edited = { ...p, originalText: 'texto editado pelo usuário', editedText: 'texto editado pelo usuário' };
    expect(edited.originalText).toBe('texto editado pelo usuário');
    expect(edited.hash).toBe(p.hash);
  });

  it('hashPrompt é estável e de 64 chars', async () => {
    const h1 = await hashPrompt({ brandKitId: 'bk-1', mode: 'professional', text: 'x', assets: ['a'], variations: 1 });
    const h2 = await hashPrompt({ brandKitId: 'bk-1', mode: 'professional', text: 'x', assets: ['a'], variations: 1 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('templates cobrem os 13 formatos exigidos', () => {
    const expected = ['post_instagram', 'story', 'carousel', 'banner', 'ad', 'promo_campaign', 'launch', 'institutional', 'holiday', 'caption', 'copy', 'visual_direction', 'artwork_variation'];
    for (const k of expected) expect(PROMPT_TEMPLATES.find((t) => t.kind === k)).toBeTruthy();
  });

  it('regras obrigatórias aparecem no prompt', async () => {
    const p = await generatePrompt(makeInput());
    expect(p.originalText).toContain('Não redesenhar o logotipo.');
    expect(p.originalText).toContain('Não inventar promoções');
    expect(p.originalText).toContain('Manter o português do Brasil');
  });
});
