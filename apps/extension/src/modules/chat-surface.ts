/**
 * Adaptador isolado para inserção de texto no ChatGPT.
 * Responsabilidade mínima: tentar inserir mediante clique explícito do usuário.
 * NÃO lê cookies, histórico, nem envia mensagens automaticamente.
 * O bloqueio por feature flag ocorre no painel/background; aqui apenas inserimos
 * quando chamado a partir da aba do ChatGPT. Nunca clicamos em "Enviar".
 */

export interface ChatCompatibility {
  supported: boolean;
  reason?: string;
}

export interface InsertResult {
  ok: boolean;
  reason?: string;
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
