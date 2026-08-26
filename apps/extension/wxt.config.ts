import { defineConfig } from 'wxt';

/**
 * WXT — builds multi-navegador.
 *
 * Scripts (package.json + root):
 *   wxt build -b chrome   / -b edge   / -b firefox
 *   wxt zip   -b chrome   / -b edge   / -b firefox
 *
 * Política de ambiente:
 *  - A origem da API vem de API_BASE (env). NÃO há fallback para http://localhost:3000
 *    em produção: se API_BASE ausente, o build falha (define vazio só é aceito em dev).
 *  - host_permissions usa a origem real (nunca placeholder SEU_DOMINIO_DA_API).
 *  - Firefox: usa sidebar_action + browser_specific_settings.gecko.id (sem sidePanel).
 *  - Chrome/Edge: Manifest V3 com sidePanel + service worker.
 */

const API_BASE = process.env.API_BASE ?? process.env.API_BASE_URL ?? 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && API_BASE === 'http://localhost:3000') {
  throw new Error(
    'API_BASE não pode ser http://localhost:3000 em produção. Defina a origem real da API.',
  );
}

const GECKO_ID = process.env.FIREFOX_GECKO_ID ?? 'mants-brand-orchestrator@mants.company';

export default defineConfig({
  srcDir: './src',
  modules: ['@wxt-dev/module-react'],
  // Injeta a origem real da API no bundle (substitui __API_BASE__ no código).
  vite: () => ({
    define: {
      __API_BASE__: JSON.stringify(API_BASE),
    },
  }),
  manifest: (env) => {
    const browser = env.browser ?? 'chrome';
    const base = {
      name: 'Mants Brand Orchestrator',
      description:
        'Painel lateral que gera prompts e Pacotes Criativos para sua conta compatível do ChatGPT.',
      version: '0.1.0',
      action: { default_title: 'Mants Brand Orchestrator' },
      host_permissions: ['https://chatgpt.com/*', `${API_BASE}/*`],
    };

    if (browser === 'firefox') {
      return {
        ...base,
        manifest_version: 3,
        permissions: ['storage', 'tabs', 'activeTab'],
        browser_specific_settings: {
          gecko: { id: GECKO_ID },
        },
        sidebar_action: {
          default_path: 'sidepanel.html',
          default_title: 'Mants — Painel lateral',
        },
      } as const;
    }

    // Chrome e Edge (Chromium): sidePanel + service worker.
    const isEdge = browser === 'edge';
    return {
      ...base,
      manifest_version: 3,
      permissions: ['storage', 'sidePanel', 'activeTab', 'tabs'],
      // Edge herda do Chromium; metadados opcionais de reconhecimento.
      ...(isEdge ? { browser_specific_settings: { edge: { /* edge specificity */ } } } : {}),
    } as const;
  },
});
