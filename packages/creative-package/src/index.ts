import type { BrandKitSnapshot } from '@mants/shared-types';
import type { GeneratedPrompt } from '@mants/prompt-engine';
import { sha256Sync } from '@mants/prompt-engine';
import JSZip from 'jszip';

export interface PackageAssetFile {
  /** Caminho relativo dentro do ZIP, ex: selected-assets/logo.png */
  path: string;
  /** Conteúdo binário (Buffer no Node / Uint8Array no browser). */
  content: Uint8Array;
  mimeType: string;
}

export interface BuildCreativePackageInput {
  organizationId: string;
  organizationName: string;
  clientId: string;
  clientName: string;
  campaignId?: string;
  campaignName?: string;
  creatorId: string;
  creatorName: string;
  brandKit: BrandKitSnapshot;
  prompt: GeneratedPrompt;
  /** Texto resumido usado no PROMPT-RESUMIDO.md. */
  promptSummary: string;
  assets: PackageAssetFile[];
  /** Aceite do usuário (registrado no manifesto). */
  acceptanceText: string;
  declaredRights: string;
  version?: number;
}

export interface BuiltPackage {
  zip: Uint8Array;
  manifest: import('@mants/shared-types').CreativePackageManifest;
  fileName: string;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

function addManifestFiles(manifest: import('@mants/shared-types').ManifestFile[], file: PackageAssetFile) {
  manifest.push({
    path: file.path,
    mimeType: file.mimeType,
    sizeBytes: file.content.byteLength,
    sha256: sha256Sync(Buffer.from(file.content).toString('binary')),
  });
}

/**
 * Constrói o Pacote Criativo (ZIP) com LEIA-ME, prompts, contexto JSON e ativos.
 * Determina nome de arquivo e manifesto com hashes SHA-256.
 */
export function buildManifest(input: BuildCreativePackageInput) {
  const now = new Date().toISOString();
  const version = input.version ?? 1;
  const files: import('@mants/shared-types').ManifestFile[] = [];
  for (const a of input.assets) addManifestFiles(files, a);

  const manifest: import('@mants/shared-types').CreativePackageManifest = {
    id: cryptoId(),
    version,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    clientId: input.clientId,
    clientName: input.clientName,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    creatorId: input.creatorId,
    creatorName: input.creatorName,
    createdAt: now,
    files,
    promptVersion: input.prompt.version,
    brandKitVersion: input.brandKit.version,
    declaredRights: input.declaredRights,
    packageHash: '',
  };
  const packageHash = sha256Sync(JSON.stringify(manifest));
  manifest.packageHash = packageHash;
  return { manifest, now };
}

export function packageFileName(input: BuildCreativePackageInput, dateIso: string): string {
  const d = dateIso.slice(0, 10);
  return `${slugify(input.clientName)}-${slugify(input.campaignName ?? 'campanha')}-${slugify(input.prompt.mode)}-${d}-v${input.version ?? 1}.zip`;
}

function readmeText(input: BuildCreativePackageInput): string {
  return `# Pacote Criativo — ${input.clientName}

Este pacote foi gerado pela **Mants Brand Orchestrator** (Mants Company).

## Como utilizar

1. Entre em sua conta do ChatGPT.
2. Inicie uma nova conversa.
3. Anexe os arquivos indicados em \`selected-assets/\`, \`logos/\`, \`fonts/\` e demais pastas.
4. Cole o conteúdo de \`PROMPT.md\`.
5. Revise as instruções antes de enviar.
6. Envie para a IA.
7. Confira textos, preços, datas e informações legais.
8. Baixe o resultado.
9. Importe o resultado na Mants Brand Orchestrator.
10. Solicite a aprovação da peça.

## Aviso importante

${input.acceptanceText}

> A Mants Brand Orchestrator não inclui acesso ao ChatGPT. Use sua própria conta compatível.
> Produto independente da Mants Company, não afiliado à OpenAI.

## Conteúdo

- \`PROMPT.md\` — prompt completo.
- \`PROMPT-RESUMIDO.md\` — versão resumida.
- \`BRAND-CONTEXT.json\` — contexto da marca.
- \`BRIEFING.json\` — briefing da campanha.
- \`OUTPUT-REQUIREMENTS.json\` — requisitos de saída.
- \`MANIFEST.json\` — manifesto com hashes e direitos.
- Pastas de ativos, logos, fontes, referências e exemplos.
`;
}

function briefingJson(input: BuildCreativePackageInput) {
  return {
    client: input.clientName,
    campaign: input.campaignName ?? null,
    mode: input.prompt.mode,
    brandKit: input.brandKit.name,
    brandKitVersion: input.brandKit.version,
    promptVersion: input.prompt.version,
    promptHash: input.prompt.hash,
    generatedAt: input.prompt.createdAt,
    creator: { id: input.creatorId, name: input.creatorName },
  };
}

function outputRequirementsJson() {
  return {
    mandatoryReview: true,
    humanApprovalRequired: true,
    restrictions: [
      'Não inventar preços, datas, endereços ou informações legais.',
      'Não alterar logotipo ou cores da marca sem autorização.',
      'Revisão humana obrigatória antes de publicar.',
    ],
    checklist: [
      'Logotipo correto',
      'Cores corretas',
      'Tipografia compatível',
      'Ortografia',
      'Tom da marca',
      'Informações verificadas',
      'Formato correto',
      'Margens corretas',
      'Direitos confirmados',
      'CTA correto',
      'Aprovação final',
    ],
  };
}

// Import estático (esModuleInterop habilitado).
export async function buildCreativePackage(
  input: BuildCreativePackageInput,
): Promise<BuiltPackage> {
  const { manifest, now } = buildManifest(input);
  const fileName = packageFileName(input, now);
  const zip = new JSZip();

  zip.file('LEIA-ME.md', readmeText(input));
  zip.file('PROMPT.md', input.prompt.originalText);
  zip.file('PROMPT-RESUMIDO.md', input.promptSummary);
  zip.file('BRAND-CONTEXT.json', JSON.stringify(input.brandKit, null, 2));
  zip.file('BRIEFING.json', JSON.stringify(briefingJson(input), null, 2));
  zip.file('OUTPUT-REQUIREMENTS.json', JSON.stringify(outputRequirementsJson(), null, 2));
  zip.file('MANIFEST.json', JSON.stringify(manifest, null, 2));

  for (const a of input.assets) {
    zip.file(a.path, a.content);
  }

  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { zip: out, manifest, fileName };
}

function cryptoId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'pkg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
