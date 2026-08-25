/**
 * SHA-256 determinístico e dependente de plataforma.
 * Web/extensão: usa crypto.subtle. Node: usa node:crypto. Testes: carregado pelo vitest (node).
 */
import * as nodeCrypto from 'node:crypto';

export type HashFunction = (input: string) => Promise<string>;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function normalize(input: string): string {
  // Normaliza para evitar diferenças de acentuação/espaço entre plataformas.
  return input.normalize('NFC').replace(/\r\n/g, '\n');
}

export function createSha256(): HashFunction {
  const g = globalThis as unknown as {
    crypto?: { subtle?: { digest(alg: string, data: BufferSource): Promise<ArrayBuffer> } };
  };
  if (g.crypto?.subtle) {
    return async (input: string) => {
      const data = new TextEncoder().encode(normalize(input));
      const digest = await g.crypto!.subtle!.digest('SHA-256', data);
      return toHex(digest);
    };
  }
  return async (input: string) => nodeCrypto.createHash('sha256').update(normalize(input), 'utf8').digest('hex');
}

/** Função síncrona para uso em testes onde o input já é estável. */
export function sha256Sync(input: string): string {
  return nodeCrypto.createHash('sha256').update(normalize(input), 'utf8').digest('hex');
}

/** Hash de bytes (Buffer/Uint8Array) sem normalização de texto. Para binários de assets/ZIP. */
export function sha256BytesSync(input: Uint8Array): string {
  return nodeCrypto.createHash('sha256').update(Buffer.from(input)).digest('hex');
}

/**
 * Hash canônico de um prompt: ordena campos estáveis para garantir
 * que a mesma entrada produza sempre o mesmo hash (reprodução determinística).
 */
export async function hashPrompt(input: {
  brandKitId?: string;
  campaignId?: string;
  templateId?: string;
  templateVersion?: number;
  mode: string;
  text: string;
  assets: readonly string[];
  variations: number;
}): Promise<string> {
  const canonical = {
    brandKitId: input.brandKitId ?? null,
    campaignId: input.campaignId ?? null,
    templateId: input.templateId ?? null,
    templateVersion: input.templateVersion ?? null,
    mode: input.mode,
    variations: input.variations,
    assets: [...input.assets].sort(),
    text: input.text,
  };
  const h = createSha256();
  return h(JSON.stringify(canonical));
}
