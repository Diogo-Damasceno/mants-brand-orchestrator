/* eslint-disable no-console */
import { ChatSurfaceAdapter } from '../modules/chat-surface';
import type { Runtime } from 'webextension-polyfill';

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

    type InsertMsg = { type?: unknown; text?: unknown };
    const listener = (
      msg: unknown,
      _sender: Runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): true => {
      const m = msg as InsertMsg;
      if (m?.type === 'INSERT_TEXT') {
        ChatSurfaceAdapter.insertText(String(m.text ?? ''))
          .then((r) => sendResponse({ ok: r.ok, reason: r.reason }))
          .catch((e) =>
            sendResponse({ ok: false, reason: e instanceof Error ? e.message : 'erro' }),
          );
      }
      return true; // mantém o canal aberto para sendResponse assíncrona
    };
    browser.runtime.onMessage.addListener(listener);
  },
});
