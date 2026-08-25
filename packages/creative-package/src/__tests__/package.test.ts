import { describe, it, expect } from 'vitest';
import { buildCreativePackage, type BuildCreativePackageInput, type PackageAssetFile } from '@mants/creative-package';
import type { GeneratedPrompt } from '@mants/prompt-engine';
import type { BrandKitSnapshot } from '@mants/shared-types';

function promptFixture(): GeneratedPrompt {
  return {
    id: 'gp-1',
    originalText: 'PROMPT ORIGINAL',
    summarizedText: 'RESUMO',
    mode: 'professional',
    sections: { '1. PAPEL': 'x' },
    version: 1,
    hash: 'abc123',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const brandKit: BrandKitSnapshot = {
  id: 'bk-1',
  name: 'Aurora Café',
  description: 'Cafeteria.',
  segment: 'Food',
  targetAudience: 'Local',
  personality: 'Acolhedor',
  toneOfVoice: 'Caloroso',
  slogan: 'Café da manhã',
  mission: 'Qualidade',
  values: 'Qualidade',
  colors: [{ id: 'c1', hex: '#6F4E37', rgb: '111,78,55', role: 'primary', name: 'Café', priority: 1 }],
  fonts: [{ id: 'f1', family: 'Inter', weight: '600', style: 'normal', functionRole: 'primary', commercialRightsConfirmed: true }],
  usageRules: 'Não distorcer.',
  restrictions: 'Não alterar cores.',
  approvedCtas: ['Peça o seu'],
  version: 1,
};

const asset: PackageAssetFile = {
  path: 'selected-assets/logo.png',
  content: new Uint8Array([1, 2, 3, 4, 5]),
  mimeType: 'image/png',
};

describe('creative-package', () => {
  it('gera ZIP com manifesto e hashes SHA-256', async () => {
    const input: BuildCreativePackageInput = {
      organizationId: 'org-1',
      organizationName: 'Mants Company',
      clientId: 'cl-1',
      clientName: 'Aurora Café',
      campaignId: 'c-1',
      campaignName: 'c-1',
      creatorId: 'user-1',
      creatorName: 'Usuário',
      brandKit,
      prompt: promptFixture(),
      promptSummary: 'RESUMO',
      assets: [asset],
      acceptanceText: 'Confirmo que possuo autorização.',
      declaredRights: 'Direitos confirmados.',
      version: 1,
    };
    const pkg = await buildCreativePackage(input);
    expect(pkg.zip).toBeInstanceOf(Uint8Array);
    expect(pkg.manifest.version).toBe(1);
    expect(pkg.manifest.organizationId).toBe('org-1');
    expect(pkg.manifest.files.length).toBeGreaterThan(0);
    expect(pkg.manifest.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg.fileName).toMatch(/^aurora-cafe-c-1-.*\.zip$/);
  });

  it('nome do arquivo segue o padrão exigido', async () => {
    const input: BuildCreativePackageInput = {
      organizationId: 'org-1',
      organizationName: 'Mants Company',
      clientId: 'cl-1',
      clientName: 'Aurora Café',
      campaignId: 'c-1',
      campaignName: 'c-1',
      creatorId: 'user-1',
      creatorName: 'Usuário',
      brandKit,
      prompt: promptFixture(),
      promptSummary: 'RESUMO',
      assets: [],
      acceptanceText: 'Confirmo.',
      declaredRights: 'Ok',
      version: 1,
    };
    const pkg = await buildCreativePackage(input);
    expect(pkg.fileName).toContain('aurora-cafe');
    expect(pkg.fileName.endsWith('.zip')).toBe(true);
  });
});
