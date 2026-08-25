import { defineConfig } from 'wxt';

// WXT Manifest V3. Permissões mínimas conforme spec:
// storage (sessão da Mants), sidePanel (painel lateral), activeTab (identificar aba no clique).
// host_permissions restritas: chatgpt.com e a API da Mants.
// NÃO usamos: cookies, history, downloads, webRequestBlocking, <all_urls>.
export default defineConfig({
  srcDir: './src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Mants Brand Orchestrator',
    description:
      'Painel lateral que gera prompts e Pacotes Criativos para sua conta compatível do ChatGPT.',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: [
      'https://chatgpt.com/*',
      'http://localhost:3000/*',
      'https://SEU_DOMINIO_DA_API/*',
    ],
    action: { default_title: 'Mants Brand Orchestrator' },
    version: '0.1.0',
  },
});
