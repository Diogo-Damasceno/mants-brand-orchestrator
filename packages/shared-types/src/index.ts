export { ROLES, canManageRole } from './domain.js';
export type { Role } from './domain.js';
export {
  CAMPAIGN_STATUSES,
  PROMPT_MODES,
  PROMPT_TEMPLATE_KINDS,
  ASSET_STATUSES,
  ASSET_ORIENTATIONS,
  RESULT_STATUSES,
  PLAN_TIERS,
  BILLING_PROVIDERS,
  EXTENSION_SESSION_STATUSES,
} from './domain.js';
export type {
  CampaignStatus,
  PromptMode,
  PromptTemplateKind,
  AssetStatus,
  AssetOrientation,
  ResultStatus,
  PlanTier,
  BillingProvider,
  ExtensionSessionStatus,
  PlanLimits,
  BrandColor,
  BrandFont,
  BrandKitSnapshot,
} from './domain.js';
export type {
  CampaignBrief,
  SelectedAsset,
  PromptTemplate,
  GeneratedPromptRecord,
  CreativePackageManifest,
  ManifestFile,
} from './workflow.js';

/** Avisos comerciais obrigatórios (texto canônico, em pt-BR). */
export const COMMERCIAL_DISCLAIMERS = {
  chatgptNotIncluded:
    'ChatGPT não está incluído na assinatura da Mants Brand Orchestrator. Para utilizar os Pacotes Criativos e os recursos de inteligência artificial, o usuário deverá possuir sua própria conta compatível do ChatGPT. Recomendamos o ChatGPT Plus para uma experiência mais completa. A assinatura do ChatGPT é contratada e cobrada separadamente pela OpenAI.',
  notAffiliated:
    'A Mants Brand Orchestrator é um produto independente desenvolvido pela Mants Company. Não é um produto oficial da OpenAI e não é patrocinado, operado ou endossado pela OpenAI. ChatGPT e OpenAI são marcas de seus respectivos proprietários.',
  pricingIndependent:
    'Os valores correspondem exclusivamente à Mants Brand Orchestrator. Serviços e assinaturas de terceiros, incluindo ChatGPT, não estão incluídos.',
  exportAcceptance:
    'Confirmo que possuo autorização para utilizar e enviar estes arquivos ao serviço de inteligência artificial escolhido. Entendo que o processamento ocorrerá fora da plataforma Mants Brand Orchestrator e estará sujeito aos termos e à política de privacidade desse serviço.',
} as const;

/** Plus é recomendação, nunca garantia técnica. Expressões proibidas de afirmar. */
export const PLUS_PROHIBITED_CLAIMS = [
  'uso ilimitado',
  'imagens ilimitadas',
  'acesso garantido a determinado modelo',
  'integrações permanentes',
  'ausência de limites',
  'disponibilidade garantida',
  'acesso garantido a plugins',
] as const;
