import { defineConfig } from 'wxt';

/**
 * WXT — builds multi-navegador.
 *
 * Política de ambiente:
 *  - A origem da API vem de API_BASE (env), injetada EXCLUSIVAMENTE via define
 *    __API_BASE__. NÃO há fallback para http://localhost:3000 em produção: se
 *    API_BASE ausente, o build falha (define vazio só é aceito em dev).
 *  - O modo de build (production/dev) vem de BUILD_MODE, injetado via
 *    __MANTS_BUILD_MODE__. Usado em runtime para proibir localhost HTTP em
 *    produção (process.env não existe no navegador).
 *  - host_permissions usa a origem real (nunca placeholder SEU_DOMINIO_DA_API).
 *  - Firefox: usa sidebar_action + browser_specific_settings.gecko.id.
 *  - Chrome/Edge: Manifest V3 com sidePanel + service worker.
 */

const API_BASE = process.env.API_BASE ?? process.env.API_BASE_URL ?? 'http://localhost:3000';
const BUILD_MODE = process.env.BUILD_MODE ?? 'development';

if (BUILD_MODE === 'production' && API_BASE === 'http://localhost:3000') {
  throw new Error(
    'API_BASE não pode ser http://localhost:3000 em produção. Defina a origem real da API.',
  );
}

const GECKO_ID = process.env.FIREFOX_GECKO_ID ?? 'mants-brand-orchestrator@mants.company';

const ICONS = {
  '16': 'icon-16.png',
  '32': 'icon-32.png',
  '48': 'icon-48.png',
  '96': 'icon-96.png',
  '128': 'icon-128.png',
};

export default defineConfig({
  srcDir: './src',
  modules: ['@wxt-dev/module-react'],
  // Firefox: forçar Manifest V3 (MV2 é legado e incompatível com service worker
  // e sidebar_action moderno). Chrome/Edge já são MV3 por padrão.
  manifestVersion: 3,
  // Injeta a origem real da API e o modo de build no bundle (substitui os defines).
  vite: () => ({
    define: {
      __API_BASE__: JSON.stringify(API_BASE),
      __MANTS_BUILD_MODE__: JSON.stringify(BUILD_MODE),
    },
  }),
  manifest: (env) => {
    const browser = env.browser ?? 'chrome';
    const base = {
      name: 'Mants Brand Orchestrator',
      description:
        'Painel lateral que gera prompts e Pacotes Criativos para sua conta compatível do ChatGPT.',
      version: '0.1.0',
      // Ícones declarados explicitamente em todos os builds.
      icons: ICONS,
      action: {
        default_title: 'Mants Brand Orchestrator',
        // Entrypoint HTML do popup (WXT gera popup.html a partir de entrypoints/popup/index.html).
        default_popup: 'popup.html',
      },
      // host_permissions DEVE corresponder à origem real (API_BASE), nunca ChatGPT.
      host_permissions: [`${API_BASE}/*`],
    };

    if (browser === 'firefox') {
      return {
        ...base,
        permissions: ['storage', 'tabs', 'activeTab', 'alarms', 'downloads'],
        browser_specific_settings: {
          gecko: { id: GECKO_ID },
        },
        icons: {
          16: 'icon-16.png',
          32: 'icon-32.png',
          48: 'icon-48.png',
          96: 'icon-96.png',
          128: 'icon-128.png',
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
      action: {
        default_title: 'Mants Brand Orchestrator',
        default_popup: 'popup/index.html',
        default_icon: {
          16: 'icon-16.png',
          32: 'icon-32.png',
          48: 'icon-48.png',
          96: 'icon-96.png',
          128: 'icon-128.png',
        },
      },
      icons: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        96: 'icon-96.png',
        128: 'icon-128.png',
      },
      side_panel: {
        default_path: 'sidepanel/index.html',
      },
      permissions: ['storage', 'sidePanel', 'activeTab', 'tabs', 'alarms', 'downloads'],
      ...(isEdge ? { browser_specific_settings: { edge: {} } } : {}),
    } as const;
  },
});
