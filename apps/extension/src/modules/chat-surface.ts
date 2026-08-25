1|2|
3|/**
4| * Adaptador isolado para inserção de texto no ChatGPT.
5| * Responsabilidade mínima: tentar inserir mediante clique explícito.
6| * NÃO lê cookies, histórico, nem envia mensagens automaticamente.
7| * A inserção é experimental e fica atrás da feature flag FEATURE_CHATGPT_ASSISTED_INSERTION.
8| */
9|
10|export interface ChatCompatibility {
11|  supported: boolean;
12|  reason?: string;
13|}
14|
15|export interface InsertResult {
16|  ok: boolean;
17|  reason?: string;
18|}
19|
20|const ASSISTED_INSERTION_ENABLED = false; // definido pela API em runtime; fallback seguro desligado.
21|
22|export function isFeatureAssistedInsertionEnabled(): boolean {
23|  return ASSISTED_INSERTION_ENABLED;
24|}
25|
26|export class ChatSurfaceAdapter {
27|  /** Verifica se a página atual é compatível (chatgpt.com). */
28|  static getCompatibilityStatus(): ChatCompatibility {
29|    if (typeof location === 'undefined') return { supported: false, reason: 'Sem contexto de página.' };
30|    const url = location.href;
31|    if (!url.includes('chatgpt.com')) {
32|      return { supported: false, reason: 'Abra o ChatGPT em chatgpt.com.' };
33|    }
34|    return { supported: true };
35|  }
36|
37|  static isSupported(): boolean {
38|    return this.getCompatibilityStatus().supported;
39|  }
40|
41|  /** Tenta inserir texto no campo de prompt. Retorna sucesso/falha para o fallback. */
42|  static async insertText(text: string): Promise<InsertResult> {
43|    if (!this.isSupported()) return { ok: false, reason: 'Página incompatível.' };
44|    if (!isFeatureAssistedInsertionEnabled()) {
45|      return { ok: false, reason: 'Inserção assistida desativada. Use "Copiar prompt".' };
46|    }
47|    try {
48|      const ta = document.querySelector('textarea');
49|      if (!ta) return { ok: false, reason: 'Campo não encontrado.' };
50|      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
51|      setter?.call(ta, text);
52|      ta.dispatchEvent(new Event('input', { bubbles: true }));
53|      return { ok: true };
54|    } catch (e) {
55|      return { ok: false, reason: e instanceof Error ? e.message : 'Falha ao inserir.' };
56|    }
57|  }
58|}
59|