1|2|import { ChatSurfaceAdapter } from '../modules/chat-surface';
3|import { getSession } from '../modules/storage';
4|
5|// Background service worker: autenticação, mensagens, abertura de abas, telemetria limitada.
6|export default defineBackground(() => {
7|  browser.runtime.onInstalled.addListener(() => {
8|    console.log('[Mants] extensão instalada.');
9|  });
10|
11|  // Tenta inserir texto no ChatGPT mediante clique explícito (protegido por feature flag no adapter).
12|  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
13|    if (msg?.type === 'INSERT_TEXT') {
14|      ChatSurfaceAdapter.insertText(String(msg.text ?? ''))
15|        .then((r) => sendResponse({ ok: r.ok, reason: r.reason }))
16|        .catch((e) => sendResponse({ ok: false, reason: e instanceof Error ? e.message : 'erro' }));
17|      return true; // resposta assíncrona
18|    }
19|    if (msg?.type === 'OPEN_CHATGPT') {
20|      browser.tabs.create({ url: 'https://chatgpt.com/' });
21|      return;
22|    }
23|    if (msg?.type === 'CHECK_SESSION') {
24|      getSession()
25|        .then((s) => sendResponse({ authenticated: !!s }))
26|        .catch(() => sendResponse({ authenticated: false }));
27|      return true;
28|    }
29|  });
30|});
31|