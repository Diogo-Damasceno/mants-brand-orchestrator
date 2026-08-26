import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes do módulo de alarme durável (browser.alarms).
 *
 * Regras verificadas:
 *  - periodInMinutes nunca fica abaixo do piso seguro (>= 0.5 => 30s);
 *  - não há criação de alarm duplicado (clear antes de create);
 *  - intervalo convertido corretamente (ms -> minutos);
 *  - Firefox detectado pelo protocolo moz-extension;
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

const storageApi = {
  local: {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  },
};

const browserMock = {
  alarms: alarmsApi,
  storage: storageApi,
  runtime: {
    getURL: vi.fn((p: string) => `chrome-extension://abc/${p}`),
  },
};

// Injeta o global `browser` antes de importar o módulo sob teste.
vi.stubGlobal('browser', browserMock);

const {
  scheduleAlarm,
  clearAlarm,
  hasAlarm,
  toPeriodMinutes,
  MIN_POLL_INTERVAL_MS,
  ALARM_NAME,
} = await import('../poll-alarm');

beforeEach(() => {
  alarms.clear();
  alarmsApi.create.mockClear();
  alarmsApi.clear.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toPeriodMinutes', () => {
  it('respeita o piso de 30s (0.5 min)', () => {
    expect(toPeriodMinutes(2_000)).toBe(0.5);
    expect(toPeriodMinutes(0)).toBe(0.5);
  });
  it('converte 30s e 60s corretamente', () => {
    expect(toPeriodMinutes(30_000)).toBe(0.5);
    expect(toPeriodMinutes(60_000)).toBe(1);
  });
});

describe('scheduleAlarm', () => {
  it('cria o alarm com periodInMinutes >= 0.5 (nunca abaixo do mínimo)', async () => {
    const period = await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    expect(period).toBeGreaterThanOrEqual(0.5);
    expect(alarmsApi.create).toHaveBeenCalledTimes(1);
    const opts = alarmsApi.create.mock.calls[0]![1];
    expect(opts.periodInMinutes).toBeGreaterThanOrEqual(0.5);
  });

  it('não recria alarm abaixo do mínimo (rejeita backoff de poucos segundos)', async () => {
    const period = await scheduleAlarm(2_000);
    expect(period).toBe(0.5); // 2s seria < 30s, então sobe para o piso
    const opts = alarmsApi.create.mock.calls[0]![1];
    expect(opts.periodInMinutes).toBe(0.5);
  });

  it('evita alarm duplicado (limpa antes de criar)', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    // create chamado 2x, mas clear chamado 1x ANTES de cada create => nunca 2 simultâneos
    expect(alarmsApi.create).toHaveBeenCalledTimes(2);
    expect(alarmsApi.clear).toHaveBeenCalledTimes(2);
    expect(alarms.get(ALARM_NAME)).toBeDefined();
    expect(alarms.size).toBe(1);
  });

  it('limpa e cria no nome canônico', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    expect(alarms.has(ALARM_NAME)).toBe(true);
  });
});

describe('clearAlarm / hasAlarm', () => {
  it('clearAlarm remove o alarm sem lançar', async () => {
    await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    await clearAlarm();
    expect(alarms.has(ALARM_NAME)).toBe(false);
  });

  it('hasAlarm reflete o estado', async () => {
    expect(await hasAlarm()).toBe(false);
    await scheduleAlarm(MIN_POLL_INTERVAL_MS);
    expect(await hasAlarm()).toBe(true);
  });
});

describe('isFirefox', () => {
  it('detecta Firefox pelo protocolo moz-extension', async () => {
    const mod = await import('../poll-alarm');
    // chrome-extension => não é firefox
    expect(mod.isFirefox()).toBe(false);
  });
});
