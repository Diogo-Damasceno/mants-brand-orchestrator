import { ChatSurfaceAdapter } from '../modules/chat-surface';

// Content script: responsabilidade mínima no chatgpt.com.
// Não lê cookies, histórico, nem envia mensagens automaticamente.
export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    // Apenas expõe a compatibilidade; a inserção é solicitada pelo background via mensagem.
    void ctx;
    const status = ChatSurfaceAdapter.getCompatibilityStatus();
    console.log('[Mants] compatibilidade:', status);
  },
});
