import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes do módulo de alarme durável (browser.alarms).
 *
 * Regras verificadas:
 *  - Chrome/Edge: periodInMinutes nunca fica abaixo de 0.5 (30s);
 *  - Firefox: periodInMinutes nunca fica abaixo de 1 (60s);
 *  - não há criação de alarm duplicado (clear antes de create);
 *  - intervalo convertido corretamente (ms -> minutos);
 *  - detecção de navegador por protocolo;
 *  - clearAlarm não lança.
 *
 * `browser` é mockado como global (comportamento de runtime da extensão).
 */

const alarms = new Map<string, { periodInMinutes: number }>();
const alarmsApi = {
  create: vi.fn(async (name: string, opts: { periodInMinutes: number }) => {
    alarms.set(name, { periodInMinutes: opts.periodInMinutes });
  }),
  clear: vi.fn(async (name: string) => {
    alarms.delete(name);
    return true;
  }),
  get: vi.fn(async (name: string) => alarms.get(name) ?? null),
};

function makeBrowser(runtimeUrl: string) {
  return {
    alarms: alarmsApi,
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() } },
    runtime: { getURL: vi.fn((p: string) => `${runtimeUrl}/${p}`) },
  };
}

vi.stubGlobal('browser', makeBrowser('chrome-extension://abc'));
const {
  scheduleAlarm,
  clearAlarm,
  hasAlarm,
  toPeriodMinutes,
  detectBrowser,
  minPeriodMinutes,
  MIN_POLL_INTERVAL_MS,
  ALARM_NAME,
} = await import('../poll-alarm');

beforeEach(() => {
  alarms.clear();
  alarmsApi.create.mockClear();
  alarmsApi.clear.mockClear();
});

describe('periodInMinutes por navegador', () => {
  it('Chrome/Edge respeitam o piso de 30s (0.5 min)', () => {
    expect(minPeriodMinutes('chrome')).toBe(0.5);
    expect(minPeriodMinutes('edge')).toBe(0.5);
    expect(toPeriodMinutes(2_000, 'chrome')).toBe(0.5);
    expect(toPeriodMinutes(0, 'edge')).toBe(0.5);
    expect(toPeriodMinutes(30_000, 'chrome')).toBe(0.5);
    expect(toPeriodMinutes(60_000, 'edge')).toBe(1);
  });

  it('Firefox usa piso de 1 minuto (60s)', () => {
    expect(minPeriodMinutes('firefox')).toBe(1);
    expect(toPeriodMinutes(2_000, 'firefox')).toBe(1);
    expect(toPeriodMinutes(30_000, 'firefox')).toBe(1);
    expect(toPeriodMinutes(60_000, 'firefox')).toBe(1);
    expect(toPeriodMinutes(120_000, 'firefox')).toBe(2);
  });
});

describe('scheduleAlarm', () => {
  it('Chrome cria o alarm com periodInMinutes = 0.5 (mínimo permitido)', async () => {
    const period = await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    expect(period).toBe(0.5);
    expect(alarmsApi.create).toHaveBeenCalledTimes(1);
    const opts = alarmsApi.create.mock.calls[0]![1];
    expect(opts.periodInMinutes).toBe(0.5);
  });

  it('Edge usa o piso mínimo permitido (0.5)', async () => {
    const period = await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'edge');
    expect(period).toBe(0.5);
  });

  it('Firefox usa 1 minuto (não 0.5)', async () => {
    const period = await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'firefox');
    expect(period).toBe(1);
    const opts = alarmsApi.create.mock.calls[0]![1];
    expect(opts.periodInMinutes).toBe(1);
  });

  it('não recria alarm abaixo do mínimo (rejeita backoff de poucos segundos)', async () => {
    const period = await scheduleAlarm(2_000, 'chrome');
    expect(period).toBe(0.5);
  });

  it('evita alarm duplicado (limpa antes de criar)', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    expect(alarmsApi.create).toHaveBeenCalledTimes(2);
    expect(alarmsApi.clear).toHaveBeenCalledTimes(2);
    expect(alarms.get(ALARM_NAME)).toBeDefined();
    expect(alarms.size).toBe(1);
  });

  it('limpa e cria no nome canônico', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    expect(alarms.has(ALARM_NAME)).toBe(true);
  });
});

describe('clearAlarm / hasAlarm', () => {
  it('clearAlarm remove o alarm sem lançar', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    await clearAlarm();
    expect(alarms.has(ALARM_NAME)).toBe(false);
  });

  it('hasAlarm reflete o estado', async () => {
    expect(await hasAlarm()).toBe(false);
    await scheduleAlarm(MIN_POLL_INTERVAL_MS, 'chrome');
    expect(await hasAlarm()).toBe(true);
  });
});

describe('detectBrowser', () => {
  it('detecta Chrome', () => expect(detectBrowser('chrome-extension://abc/x')).toBe('chrome'));
  it('detecta Edge', () => expect(detectBrowser('edge-extension://abc/x')).toBe('edge'));
  it('detecta Firefox', () => expect(detectBrowser('moz-extension://abc/x')).toBe('firefox'));
  it('desconhecido quando não há protocolo', () => expect(detectBrowser('http://x')).toBe('unknown'));
});
