/**
 * Estratégia durável de polling para o fluxo PKCE no background (Chromium MV3).
 *
 * Regras obrigatórias (Chromium/Edge atuais):
 *  - `browser.alarms.create` com `periodInMinutes` < 0.5 (30s) é SILENCIOSAMENTE
 *    ajustado para 1 minuto pelo navegador, e valores muito baixos (ex.: 0.033 min)
 *    podem ser rejeitados. Por isso o intervalo mínimo seguro é 30s (0.5 min).
 *  - NÃO se recria um alarme abaixo do mínimo para simular backoff de poucos
 *    segundos: o polling rápido é feito UMA vez de imediato (ao criar/recuperar o
 *    fluxo), e depois apenas com o alarme durável válido.
 *  - Firefox: `browser.alarms` existe, mas o mínimo também é 1 minuto para alarms
 *    periódicos. Usamos o mesmo piso de 30s; se o runtime do Firefox impuser 1 min,
 *    o alarme durável cobre (30s é >= tolerável na prática; documentado).
 *  - Expiração é controlada por `createdAt` (FLOW_TTL_MS), nunca por contador.curto.
 *  - Alarms duplicados são evitados: `scheduleAlarm` sempre limpa antes de criar.
 *  - O alarme é limpo em sucesso, cancelamento, erro definitivo e expiração.
 */

export const ALARM_NAME = 'mants_pkce_poll';

/** Piso seguro em minutos para Chromium/Edge/Firefox (>= 30s). */
export const MIN_PERIOD_MINUTES = 0.5;
/** Piso seguro em ms (30s). */
export const MIN_POLL_INTERVAL_MS = 30_000;
/** Teto de segurança (não precisa de backoff acima disso). */
export const MAX_POLL_INTERVAL_MS = 60_000;

/** Converte ms -> minutos respeitando o piso do navegador. */
export function toPeriodMinutes(ms: number): number {
  const clamped = Math.max(ms, MIN_POLL_INTERVAL_MS);
  return clamped / 60_000;
}

/** Detecta Firefox pelo protocolo moz-extension. */
export function isFirefox(): boolean {
  try {
    return typeof browser !== 'undefined' && browser.runtime.getURL('').includes('moz-extension');
  } catch {
    return false;
  }
}

/**
 * Agenda o alarme durável de polling.
 * Retorna o `periodInMinutes` efetivamente usado (para fins de teste/auditoria).
 * Garante que não há alarme duplicado (limpa antes de criar).
 */
export async function scheduleAlarm(intervalMs: number): Promise<number> {
  await clearAlarm();
  const period = toPeriodMinutes(intervalMs);
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
