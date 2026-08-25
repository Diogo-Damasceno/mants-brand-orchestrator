export interface CampaignBrief {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  brandKitId?: string;
  brandKitName?: string;
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
  selectedAssetIds: string[];
  promptMode: import('./domain.js').PromptMode;
  variations: number;
  status: import('./domain.js').CampaignStatus;
}

export interface SelectedAsset {
  id: string;
  originalName: string;
  mimeType: string;
  orientation?: import('./domain.js').AssetOrientation;
  tags: string[];
  productIds: string[];
  campaignIds: string[];
  brandKitId?: string;
  status: import('./domain.js').AssetStatus;
  commercialRightsConfirmed: boolean;
  expiresAt?: string;
  archived: boolean;
  predominantColorHex?: string;
  sizeBytes?: number;
  priority?: number;
}

export interface PromptTemplate {
  id: string;
  kind: import('./domain.js').PromptTemplateKind;
  name: string;
  description?: string;
  /** Texto com marcadores {section} substituídos pelo motor. */
  body: string;
  defaultMode: import('./domain.js').PromptMode;
  version: number;
}

export interface GeneratedPromptRecord {
  promptId: string;
  brandKitId?: string;
  brandKitVersion?: number;
  campaignId?: string;
  templateId?: string;
  templateVersion?: number;
  mode: import('./domain.js').PromptMode;
  originalText: string;
  editedText?: string;
  editedBy?: string;
  editedAt?: string;
  version: number;
  hash: string;
  createdAt: string;
  createdBy: string;
}

export interface CreativePackageManifest {
  id: string;
  version: number;
  organizationId: string;
  organizationName: string;
  clientId: string;
  clientName: string;
  campaignId?: string;
  campaignName?: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  files: ManifestFile[];
  promptVersion: number;
  brandKitVersion: number;
  declaredRights: string;
  packageHash: string;
}

export interface ManifestFile {
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
