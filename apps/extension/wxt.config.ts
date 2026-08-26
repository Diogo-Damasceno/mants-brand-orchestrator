import { defineConfig } from 'wxt';
import { execSync } from 'node:child_process';

// Build por navegador controlado pela variável WXT_BROWSER (chrome|edge|firefox).
// Scripts em package.json: extension:build:chrome|edge|firefox e extension:zip:*.
const BROWSER = (process.env.WXT_BROWSER ?? 'chrome').toLowerCase();

// Domínio real da API por ambiente. Nunca cai em localhost:3000 em produção.
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

// Versão real do manifesto (gerada a partir de package.json para evitar descompasso).
function pkgVersion(): string {
  try {
    return JSON.parse(execSync('cat package.json').toString()).version as string;
  } catch {
    return '0.1.0';
  }
}
const VERSION = process.env.EXT_VERSION ?? pkgVersion();

// IDs/domínios por navegador.
const GECKO_ID = process.env.EXT_GECKO_ID ?? 'mants-brand-orchestrator@mants.company';
const EDGE_DOMAIN = process.env.EDGE_DOMAIN ?? 'mants.company';

const isFirefox = BROWSER === 'firefox';

// Permissões mínimas: storage (sessão), e sidePanel (Chromium) ou
// browser_action/sidebar_action (Firefox). NÃO usamos cookies/history/downloads/webRequestBlocking.
const permissions: string[] = ['storage'];
if (!isFirefox) permissions.push('sidePanel');
else permissions.push('sidebarAction');

// Host permissions: ChatGPT + API real. Sem placeholders em produção.
const hostPermissions = ['https://chatgpt.com/*'];
if (API_BASE && API_BASE !== 'http://localhost:3000') {
  hostPermissions.push(`${new URL(API_BASE).origin}/*`);
}

export default defineConfig({
  srcDir: './src',
  modules: ['@wxt-dev/module-react'],
  browser: isFirefox ? 'firefox' : 'chrome',
  manifestVersion: isFirefox ? 2 : 3,
  manifest: {
    name: 'Mants Brand Orchestrator',
    description:
      'Painel lateral que gera prompts e Pacotes Criativos para sua conta compatível do ChatGPT.',
    version: VERSION,
    permissions,
    host_permissions: hostPermissions,
    ...(isFirefox
      ? {
          browser_specific_settings: {
            gecko: { id: GECKO_ID },
          },
          sidebar_action: {
            default_title: 'Mants Brand Orchestrator',
            default_panel: '/sidepanel.html',
          },
        }
      : {
          action: { default_title: 'Mants Brand Orchestrator' },
          // Edge herda MV3 + sidePanel; domínio real configurável.
          ...(BROWSER === 'edge' ? { edge_domain: EDGE_DOMAIN } : {}),
        }),
  },
});
