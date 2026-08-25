import { ChatSurfaceAdapter } from '../modules/chat-surface';
import { getSession } from '../modules/storage';

// Background service worker: autenticação, mensagens, abertura de abas, telemetria limitada.
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.log('[Mants] extensão instalada.');
  });

  // Tenta inserir texto no ChatGPT mediante clique explícito (protegido por feature flag no adapter).
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'INSERT_TEXT') {
      ChatSurfaceAdapter.insertText(String(msg.text ?? ''))
        .then((r) => sendResponse({ ok: r.ok, reason: r.reason }))
        .catch((e) => sendResponse({ ok: false, reason: e instanceof Error ? e.message : 'erro' }));
      return true; // resposta assíncrona
    }
    if (msg?.type === 'OPEN_CHATGPT') {
      browser.tabs.create({ url: 'https://chatgpt.com/' });
      return;
    }
    if (msg?.type === 'CHECK_SESSION') {
      getSession()
        .then((s) => sendResponse({ authenticated: !!s }))
        .catch(() => sendResponse({ authenticated: false }));
      return true;
    }
  });
});
