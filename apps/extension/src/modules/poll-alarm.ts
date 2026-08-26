/**
 * Estratégia durável de polling para o fluxo PKCE no background.
 *
 * Regras obrigatórias:
 *  - Chromium/Edge: `browser.alarms.create` com `periodInMinutes` < 0.5 (30s)
 *    é SILENCIOSAMENTE ajustado para 1 minuto pelo navegador. O piso seguro é
 *    30s (0.5 min).
 *  - Firefox: o mínimo para alarms periódicos é 1 minuto. Usamos 1 minuto
 *    explicitamente (não "tolerável na prática").
 *  - NÃO se recria um alarme abaixo do mínimo para simular backoff de poucos
 *    segundos: o polling rápido é feito UMA vez de imediato (ao criar/recuperar o
 *    fluxo), e depois apenas com o alarme durável válido.
 *  - Expiração é controlada por `createdAt` (FLOW_TTL_MS), nunca por contador.curto.
 *  - Alarms duplicados são evitados: `scheduleAlarm` sempre limpa antes de criar.
 *  - O alarme é limpo em sucesso, cancelamento, erro definitivo e expiração.
 */

export const ALARM_NAME = 'mants_pkce_poll';

/** Piso seguro em minutos para Chromium/Edge (>= 30s). */
export const MIN_PERIOD_MINUTES_CHROMIUM = 0.5;
/** Piso seguro em minutos para Firefox (>= 1 minuto). */
export const MIN_PERIOD_MINUTES_FIREFOX = 1;
/** Piso seguro em ms (30s) — usado para garantir poll imediato >= mínimo. */
export const MIN_POLL_INTERVAL_MS = 30_000;

export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'unknown';

/** Detecta o navegador de forma testável (injeta runtime quando necessário). */
export function detectBrowser(runtimeUrl?: string): BrowserKind {
  const url = runtimeUrl ?? (typeof browser !== 'undefined' ? browser.runtime.getURL('') : '');
  if (url.includes('moz-extension')) return 'firefox';
  if (url.includes('edge-extension')) return 'edge';
  if (url.includes('chrome-extension')) return 'chrome';
  return 'unknown';
}

/** Piso em minutos conforme o navegador. */
export function minPeriodMinutes(kind: BrowserKind): number {
  return kind === 'firefox' ? MIN_PERIOD_MINUTES_FIREFOX : MIN_PERIOD_MINUTES_CHROMIUM;
}

/**
 * Converte ms -> minutos respeitando o piso do navegador.
 * `kind` pode ser injetado para testes; senão é detectado em runtime.
 */
export function toPeriodMinutes(ms: number, kind?: BrowserKind): number {
  const resolved = kind ?? detectBrowser();
  const floor = minPeriodMinutes(resolved);
  const clampedMs = Math.max(ms, floor * 60_000);
  return clampedMs / 60_000;
}

/** Agenda o alarme durável de polling (piso por navegador). Retorna o periodInMinutes usado. */
export async function scheduleAlarm(intervalMs: number, kind?: BrowserKind): Promise<number> {
  await clearAlarm();
  const period = toPeriodMinutes(intervalMs, kind);
  await browser.alarms.create(ALARM_NAME, { periodInMinutes: period });
  return period;
}

export async function clearAlarm(): Promise<void> {
  try {
    await browser.alarms.clear(ALARM_NAME);
  } catch {
    /* ignore */
  }
}

export async function hasAlarm(): Promise<boolean> {
  try {
    const a = await browser.alarms.get(ALARM_NAME);
    return Boolean(a);
  } catch {
    return false;
  }
}
