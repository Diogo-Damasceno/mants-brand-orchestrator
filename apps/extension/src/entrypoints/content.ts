/* eslint-disable no-console */
import { ChatSurfaceAdapter } from '../modules/chat-surface';

// Content script: responsabilidade mínima no chatgpt.com.
// Não lê cookies, histórico, nem envia mensagens automaticamente.
// Recebe INSERT_TEXT do background e insere no campo de prompt mediante a
// ação indireta do usuário (o background só encaminha após clique no painel).
export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    void ctx;
    const status = ChatSurfaceAdapter.getCompatibilityStatus();
    console.log('[Mants] compatibilidade:', status);

    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'INSERT_TEXT') {
        ChatSurfaceAdapter.insertText(String(msg.text ?? ''))
          .then((r) => sendResponse({ ok: r.ok, reason: r.reason }))
          .catch((e) =>
            sendResponse({ ok: false, reason: e instanceof Error ? e.message : 'erro' }),
          );
        return true; // resposta assíncrona
      }
      return false;
    });
  },
});
