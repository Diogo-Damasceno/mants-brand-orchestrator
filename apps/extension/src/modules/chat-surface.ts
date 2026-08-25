
/**
 * Adaptador isolado para inserção de texto no ChatGPT.
 * Responsabilidade mínima: tentar inserir mediante clique explícito.
 * NÃO lê cookies, histórico, nem envia mensagens automaticamente.
 * A inserção é experimental e fica atrás da feature flag FEATURE_CHATGPT_ASSISTED_INSERTION.
 */

export interface ChatCompatibility {
  supported: boolean;
  reason?: string;
}

export interface InsertResult {
  ok: boolean;
  reason?: string;
}

const ASSISTED_INSERTION_ENABLED = false; // definido pela API em runtime; fallback seguro desligado.

export function isFeatureAssistedInsertionEnabled(): boolean {
  return ASSISTED_INSERTION_ENABLED;
}

export class ChatSurfaceAdapter {
  /** Verifica se a página atual é compatível (chatgpt.com). */
  static getCompatibilityStatus(): ChatCompatibility {
    if (typeof location === 'undefined') return { supported: false, reason: 'Sem contexto de página.' };
    const url = location.href;
    if (!url.includes('chatgpt.com')) {
      return { supported: false, reason: 'Abra o ChatGPT em chatgpt.com.' };
    }
    return { supported: true };
  }

  static isSupported(): boolean {
    return this.getCompatibilityStatus().supported;
  }

  /** Tenta inserir texto no campo de prompt. Retorna sucesso/falha para o fallback. */
  static async insertText(text: string): Promise<InsertResult> {
    if (!this.isSupported()) return { ok: false, reason: 'Página incompatível.' };
    if (!isFeatureAssistedInsertionEnabled()) {
      return { ok: false, reason: 'Inserção assistida desativada. Use "Copiar prompt".' };
    }
    try {
      const ta = document.querySelector('textarea');
      if (!ta) return { ok: false, reason: 'Campo não encontrado.' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Falha ao inserir.' };
    }
  }
}
