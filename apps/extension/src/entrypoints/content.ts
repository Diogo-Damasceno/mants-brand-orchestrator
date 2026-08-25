1|2|import { ChatSurfaceAdapter } from '../modules/chat-surface';
3|
4|// Content script: responsabilidade mínima no chatgpt.com.
5|// Não lê cookies, histórico, nem envia mensagens automaticamente.
6|export default defineContentScript({
7|  matches: ['https://chatgpt.com/*'],
8|  runAt: 'document_idle',
9|  main(ctx) {
10|    // Apenas expõe a compatibilidade; a inserção é solicitada pelo background via mensagem.
11|    void ctx;
12|    const status = ChatSurfaceAdapter.getCompatibilityStatus();
13|    console.log('[Mants] compatibilidade:', status);
14|  },
15|});
16|