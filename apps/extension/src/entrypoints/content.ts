import { ChatSurfaceAdapter } from '../modules/chat-surface';

// Content script: executa SOMENTE no chatgpt.com. Recebe INSERT_TEXT do background
// e chama ChatSurfaceAdapter.insertText() (que manipula o DOM da página).
// Não lê cookies, histórico, nem envia mensagens automaticamente.
export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    const status = ChatSurfaceAdapter.getCompatibilityStatus();
    console.log('[Mants] compatibilidade:', status);

    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'INSERT_TEXT') {
        ChatSurfaceAdapter.insertText(String(msg.text ?? ''))
          .then((r) => sendResponse({ ok: r.ok, reason: r.reason }))
          .catch((e) => sendResponse({ ok: false, reason: e instanceof Error ? e.message : 'erro' }));
        return true; // resposta assíncrona
      }
      return false;
    });
  },
});
