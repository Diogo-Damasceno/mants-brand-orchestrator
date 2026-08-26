/* eslint-disable no-console */
import { randomUUID } from 'node:crypto';
import { hashPassword } from '@mants/auth';
import { getDb } from './client.js';
import { PLANS } from '@mants/billing';
import * as schema from './schema.js';

/**
 * Seed determinístico com marcas fictícias (Mants Company, agência fictícia, Aurora Café).
 * Idempotente: apaga dados das tabelas-chave antes de inserir.
 */
async function main() {
  const db = getDb();
  console.log('Limpando dados de demonstração...');
  await db.delete(schema.approvals);
  await db.delete(schema.comments);
  await db.delete(schema.results);
  await db.delete(schema.creativePackages);
  await db.delete(schema.generatedPrompts);
  await db.delete(schema.campaignAssets);
  await db.delete(schema.campaigns);
  await db.delete(schema.brandColors);
  await db.delete(schema.brandFonts);
  await db.delete(schema.brandRules);
  await db.delete(schema.brandKits);
  await db.delete(schema.brandAssets);
  await db.delete(schema.products);
  await db.delete(schema.clients);
  await db.delete(schema.organizationMembers);
  await db.delete(schema.subscriptions);
  await db.delete(schema.organizations);
  await db.delete(schema.users);

  console.log('Inserindo planos...');
  for (const plan of PLANS) {
    await db
      .insert(schema.plans)
      .values({
        tier: plan.tier,
        name: plan.name,
        priceBRLMonthly: plan.priceBRLMonthly,
        limits: plan.limits,
      })
      .onConflictDoNothing({ target: schema.plans.tier });
  }

  const pw = hashPassword('demo123456');
  const mantsOrgId = randomUUID();
  const agencyOrgId = randomUUID();

  console.log('Inserindo organizações e usuários...');
  await db.insert(schema.organizations).values([
    {
      id: mantsOrgId,
      name: 'Mants Company',
      slug: 'mants-company',
      planTier: 'agency',
      billingProvider: 'mock',
    },
    {
      id: agencyOrgId,
      name: 'Agência Lumière (fictícia)',
      slug: 'agencia-lumiere',
      planTier: 'agency',
      billingProvider: 'mock',
    },
  ]);

  const platformAdminId = randomUUID();
  const agencyOwnerId = randomUUID();
  const brandManagerId = randomUUID();
  const designerId = randomUUID();
  const reviewerId = randomUUID();

  await db.insert(schema.users).values([
    {
      id: platformAdminId,
      email: 'admin@mants.example',
      name: 'Administrador Mants',
      passwordHash: pw,
    },
    {
      id: agencyOwnerId,
      email: 'owner@lumiere.example',
      name: 'Proprietário Lumière',
      passwordHash: pw,
    },
    {
      id: brandManagerId,
      email: 'marcela@lumiere.example',
      name: 'Marcela Brand Manager',
      passwordHash: pw,
    },
    {
      id: designerId,
      email: 'thiago@lumiere.example',
      name: 'Thiago Designer',
      passwordHash: pw,
    },
    {
      id: reviewerId,
      email: 'cliente@auroracafe.example',
      name: 'Reviewer Aurora Café',
      passwordHash: pw,
    },
  ]);

  await db.insert(schema.organizationMembers).values([
    {
      organizationId: mantsOrgId,
      userId: platformAdminId,
      role: 'platform_admin',
    },
    {
      organizationId: agencyOrgId,
      userId: agencyOwnerId,
      role: 'organization_owner',
      invitedBy: agencyOwnerId,
    },
    {
      organizationId: agencyOrgId,
      userId: brandManagerId,
      role: 'brand_manager',
      invitedBy: agencyOwnerId,
    },
    {
      organizationId: agencyOrgId,
      userId: designerId,
      role: 'designer',
      invitedBy: agencyOwnerId,
    },
    {
      organizationId: agencyOrgId,
      userId: reviewerId,
      role: 'client_reviewer',
      invitedBy: agencyOwnerId,
    },
  ]);

  console.log('Inserindo cliente fictício Aurora Café...');
  const clientId = randomUUID();
  await db.insert(schema.clients).values({
    id: clientId,
    organizationId: agencyOrgId,
    name: 'Aurora Café',
    industry: 'Alimentício — Cafés especiais',
    website: 'https://auroracafe.example',
    notes: 'Cliente fictício para demonstração.',
  });

  console.log('Inserindo Brand Kit completo...');
  const bkId = randomUUID();
  await db.insert(schema.brandKits).values({
    id: bkId,
    organizationId: agencyOrgId,
    clientId,
    name: 'Aurora Café — Identidade Principal',
    description:
      'Marca de café especial com personalidade acolhedora, premium e artesanal.',
    segment: 'Alimentício',
    targetAudience: 'Adultos 25-45, apreciadores de café especial, classe média-alta urbana.',
    personality: 'Acolhedora, premium, artesanal, próxima.',
    toneOfVoice: 'Quente, sensorial, respeitosa, sem jargão excessivo.',
    slogan: 'O café que amanhece com você.',
    mission: 'Levar o ritual do café especial ao dia a dia com cuidado artesanal.',
    values: 'Origem, cuidado, comunidade, sustentabilidade.',
    recommendedWords: ['aroma', 'origem', 'ritual', 'acolher', 'premium', 'especial'],
    prohibitedWords: ['barato', 'industrial', 'rápido demais', 'massa'],
    brandExpressions: ['bons dias começam aqui', 'do grão ao gesto'],
    hierarchyRules: 'Logotipo principal acima de 40px; cor primária domina 60% da peça.',
    approvedLogos: ['logos/aurora-primary.svg'],
    logoVariations: ['logos/aurora-monochrome.svg', 'logos/aurora-horizontal.svg'],
    icons: ['icons/bean.svg', 'icons/sun.svg'],
    graphicElements: ['texturas de grão', 'círculos sólidos'],
    approvedPhotos: ['assets/aurora-xicara.jpg'],
    references: ['moodboard acolhedor'],
    approvedExamples: ['post instagram campanha inverno'],
    rejectedExamples: ['tema neon'],
    usageRules: 'Nunca usar fundo preto puro; manter respiro ao redor do logotipo.',
    restrictions: 'Não alterar proporções do logotipo; não usar fontes fora do kit.',
    legalInfo: 'CNPJ fictício 12.345.678/0001-90 — uso demonstrativo.',
    productsAndServices: 'Grãos especiais, assinatura de café, workshops.',
    approvedCtas: ['Peça o seu', 'Conheça a origem', 'Assine o ritual'],
    version: 1,
  });

  await db.insert(schema.brandColors).values([
    {
      brandKitId: bkId,
      name: 'Aurora Âmbar',
      hex: '#E8A33D',
      rgb: '232, 163, 61',
      cmyk: '0, 30, 74, 9',
      colorRole: 'primary',
      contrast: 'Usar texto escuro sobre âmbar.',
      priority: 1,
    },
    {
      brandKitId: bkId,
      name: 'Terra Profunda',
      hex: '#4A2C2A',
      rgb: '74, 44, 42',
      cmyk: '0, 41, 43, 71',
      colorRole: 'secondary',
      contrast: 'Bom para texto.',
      priority: 2,
    },
    {
      brandKitId: bkId,
      name: 'Neon (proibida)',
      hex: '#39FF14',
      rgb: '57, 255, 20',
      cmyk: '78, 0, 92, 0',
      colorRole: 'prohibited',
      contrast: 'Nunca usar.',
      priority: 0,
    },
  ]);

  await db.insert(schema.brandFonts).values([
    {
      brandKitId: bkId,
      family: 'Fraunces',
      weight: '600',
      style: 'normal',
      functionRole: 'primary',
      origin: 'Google Fonts (OFL)',
      license: 'SIL Open Font License',
      commercialRightsConfirmed: true,
    },
    {
      brandKitId: bkId,
      family: 'Inter',
      weight: '400',
      style: 'normal',
      functionRole: 'secondary',
      origin: 'Google Fonts (OFL)',
      license: 'SIL Open Font License',
      commercialRightsConfirmed: true,
    },
  ]);

  console.log('Inserindo produto e ativos...');
  const productId = randomUUID();
  await db.insert(schema.products).values({
    id: productId,
    organizationId: agencyOrgId,
    clientId,
    name: 'Assinatura Aurora Mensal',
    description: 'Entrega mensal de grãos especiais moídos na hora.',
  });

  const assetId = randomUUID();
  await db.insert(schema.brandAssets).values({
    id: assetId,
    organizationId: agencyOrgId,
    clientId,
    brandKitId: bkId,
    storageKey: `assets/${assetId}-xicara.jpg`,
    originalName: 'aurora-xicara.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 482000,
    orientation: 'square',
    predominantColorHex: '#E8A33D',
    status: 'approved',
    commercialRightsConfirmed: true,
    priority: 1,
    assetHash: 'demo-hash-xicara',
    version: 1,
  });

  await db.insert(schema.assetTags).values([
    { id: randomUUID(), organizationId: agencyOrgId, name: 'cafe' },
    { id: randomUUID(), organizationId: agencyOrgId, name: 'promo' },
  ]);

  console.log('Inserindo campanha e prompt...');
  const campaignId = randomUUID();
  await db.insert(schema.campaigns).values({
    id: campaignId,
    organizationId: agencyOrgId,
    clientId,
    brandKitId: bkId,
    name: 'Inverno Aurora 2026',
    objective: 'Aumentar assinaturas em 15% na temporada de inverno.',
    productOrService: 'Assinatura Aurora Mensal',
    audience: 'Apreciadores de café especial, 25-45 anos.',
    channel: 'Instagram',
    format: 'Post',
    dimensions: '1080x1080',
    offer: 'Primeiro mês com 20% de desconto.',
    cta: 'Assine o ritual',
    tone: 'Quente e acolhedor',
    mandatoryContent: ['Logotipo Aurora', 'Café em xícara'],
    prohibitedContent: ['Tom neon', 'Promessas de cura'],
    promptMode: 'professional',
    variations: 3,
    status: 'ready_to_use',
  });

  console.log('Seed concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
