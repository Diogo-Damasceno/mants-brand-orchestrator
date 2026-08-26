/**
 * Declarações ambientes para os globals do WXT quando os tipos gerados
 * automaticamente (.wxt/types) não estão presentes (ex.: antes do build).
 * Espelha a API real do WXT 0.20 (defineBackground / defineContentScript)
 * e o global `browser` (webextension-polyfill).
 */
import type { Browser } from 'webextension-polyfill';

declare global {
  // webextension-polyfill
  const browser: Browser;

  // WXT entrypoint definitions (assinaturas reais da API do WXT 0.20)
  function defineBackground(fn: () => void | Promise<void>): void;
  function defineContentScript(def: { main: (ctx: { id: string }) => void | Promise<void>; matches?: string[]; runAt?: string; [key: string]: unknown }): void;
  function defineUnlistedScript(fn: () => void | Promise<void>): void;
  function definePopup<T>(component: T): T;
  function defineSidepanel<T>(component: T): T;
  function defineOptions<T>(component: T): T;

  // Defines globais injetados pelo WXT no bundle.
  const __API_BASE__: string;
  const __MANTS_BUILD_MODE__: string;
}

export {};
