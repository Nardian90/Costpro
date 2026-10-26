/**
 * exchange-capture-diviza.test.ts — Pruebas de la lógica compartida de captura
 * tras la sustitución de solucionescuba.com por Diviza (misión IC-DIVIZA) y la
 * corrección de la cadena completa del botón «Actualizar BD» (IC-DIVIZA-002).
 *
 * Casos de aceptación de la misión IC-DIVIZA-002 §6 cubiertos aquí:
 *   - (1) Diviza devuelve USD=840 → captura guarda fila con fuente 'Diviza',
 *     método 'real' y FECHA OPERATIVA correcta (civil de Cuba).
 *   - (3)/(4) Estado por fuente INDEPENDIENTE: BCC ok + Diviza fallido y
 *     Diviza ok + BCC fallido (parcial identificable, sin éxito genérico).
 *   - (5) Fecha operativa correcta cerca de la medianoche UTC (antes y
 *     después del cambio de día civil cubano) — con reloj fijado.
 *   - (7) Recaptura del mismo día: actualiza sin conflicto ni duplicado.
 *   - (9) Diviza caído → sin escrituras; BCC histórico malformado → honesto.
 *   - FIX BCC /historico: array PURO sin {tasas} y sin codigoMoneda; rango
 *     de UN día (fechaFin = mismo día, ambos inclusivos).
 *   - source_updated_at se persiste cuando Diviza lo declara.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  captureForDate,
  captureInformalToday,
  captureDateRange,
  INFORMAL_ACTIVE_SOURCES,
  INFORMAL_HISTORICAL_SOURCES,
} from '@/lib/exchange-capture';
import { getOperativeDate, addDaysToDateString } from '@/lib/operative-date';

// ── Mock del adaptador Diviza ──
vi.mock('@/lib/diviza-scraper', () => ({
  fetchDivizaRates: vi.fn(),
}));
import { fetchDivizaRates } from '@/lib/diviza-scraper';
const mockDiviza = fetchDivizaRates as unknown as ReturnType<typeof vi.fn>;

// ── Mock de fetch global (BCC API + upserts REST a Supabase) ──
type FetchLog = { url: string; body?: any };
let fetchLog: FetchLog[] = [];
let fetchHandler: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

const SUPABASE_URL = 'https://test.supabase.co';
const SERVICE_KEY = 'test-service-key';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'test',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Response;
}

const BCC_ACTIVAS = {
  tasas: [
    {
      codigoMoneda: 'USD',
      fecha: '2026-10-26',
      tasaOficial: 120,
      tasaPublica: 140,
      tasaEspecial: 380,
    },
    {
      codigoMoneda: 'EUR',
      fecha: '2026-10-26',
      tasaOficial: 128,
      tasaPublica: 148,
      tasaEspecial: 400,
    },
  ],
};

/** /historico REAL: ARRAY PURO de entradas SIN codigoMoneda (FIX IC-DIVIZA-002). */
const BCC_HISTORICO_USD = [
  { fecha: '2026-10-24', tasaOficial: 24, tasaPublica: 120, tasaEspecial: 725 },
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchLog = [];
  mockDiviza.mockReset();
  fetchHandler = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Configura fetch global con handler grabador. */
function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  fetchHandler = handler;
  globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    fetchLog.push({ url: urlStr, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!fetchHandler) throw new Error('no handler');
    return fetchHandler(urlStr, init);
  }) as any;
}

const upsertsTo = () => fetchLog.filter(l => l.url.includes('/rest/v1/exchange_rates'));

describe('captureInformalToday — captura informal unificada (Diviza)', () => {
  it('persiste USD/EUR/MLC con source=Diviza y capture_method=real', async () => {
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: 930,
      mlc: 691.62,
      sourceUpdatedAt: '2026-10-26T12:30:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.provider).toBe('Diviza');
    expect(result.captured).toHaveLength(3);
    expect(result.captured.map(c => c.currency).sort()).toEqual(['EUR', 'MLC', 'USD']);
    for (const c of result.captured) {
      expect(c.source).toBe('Diviza');
      expect(c.capture_method).toBe('real');
      expect(c.segment).toBe('3');
    }
    expect(result.sourceUpdatedAt).toBe('2026-10-26T12:30:00-04:00');

    // Los upserts REST llevan source='Diviza', capture_method='real' y la
    // semántica merge-duplicates sobre la clave natural (recaptura = update)
    const upserts = upsertsTo();
    expect(upserts).toHaveLength(3);
    for (const u of upserts) {
      expect(u.body.source).toBe('Diviza');
      expect(u.body.capture_method).toBe('real');
      expect(u.body.rate).toBeGreaterThan(0);
    }
  });

  it('caso 1: Diviza devuelve USD=840 → rate_date = FECHA OPERATIVA (civil de Cuba) + source_updated_at persistido', async () => {
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: 925,
      mlc: 692.79,
      sourceUpdatedAt: '2026-10-25T20:03:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);
    const operative = getOperativeDate();

    // La fila se guarda con la fecha operativa (civil de Cuba), no la UTC
    for (const c of result.captured) {
      expect(c.date).toBe(operative);
    }
    const usdUpsert = upsertsTo().find(u => u.body.currency === 'USD')!;
    expect(usdUpsert.body.rate_date).toBe(operative);
    expect(usdUpsert.body.source).toBe('Diviza');
    expect(usdUpsert.body.capture_method).toBe('real');
    expect(usdUpsert.body.rate).toBe(840);
    // El sello del proveedor se persiste (distinto de captured_at)
    expect(usdUpsert.body.source_updated_at).toBe('2026-10-25T20:03:00-04:00');
    expect(usdUpsert.body.captured_at).not.toBe('2026-10-25T20:03:00-04:00');
  });

  it('source_updated_at ausente → el campo NO viaja en el upsert (nunca fabricado)', async () => {
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: null,
      mlc: null,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(upsertsTo()).toHaveLength(1);
    expect(upsertsTo()[0].body).not.toHaveProperty('source_updated_at');
  });

  it('upserts usan on_conflict de la clave natural + merge-duplicates (recaptura actualiza, no 409)', async () => {
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: null,
      mlc: null,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    const seen: Array<{ url: string; prefer?: string }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push({ url: String(url), prefer: headers['Prefer'] });
      return jsonResponse(200, [{}]);
    }) as any;

    await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain('on_conflict=rate_date,currency,source,segment');
    expect(seen[0].prefer).toBe('resolution=merge-duplicates');
  });

  it('cuando Diviza no publica EUR/MLC no los fabrica (null → sin fila)', async () => {
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: null,
      mlc: null,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.captured).toHaveLength(1);
    expect(result.captured[0].currency).toBe('USD');
    // Regresión crítica: NUNCA BCC×1.15 ni MLC=USD
    expect(result.captured.some(c => c.currency === 'EUR')).toBe(false);
    expect(result.captured.some(c => c.currency === 'MLC')).toBe(false);
    expect(upsertsTo()).toHaveLength(1);
  });

  it('Diviza caído → NO persiste nada y reporta error (sin estimaciones)', async () => {
    mockDiviza.mockResolvedValue(null);
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.provider).toBeNull();
    expect(result.captured).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    // Regla inviolable: cero escrituras cuando no hay cotización válida
    expect(upsertsTo()).toHaveLength(0);
  });

  it('error de red del proveedor → sin lanzar y sin escrituras', async () => {
    mockDiviza.mockRejectedValue(new Error('timeout'));
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);
    expect(result.provider).toBeNull();
    expect(result.captured).toHaveLength(0);
    expect(upsertsTo()).toHaveLength(0);
  });

  it('caso 5: ANTES del cambio de día civil cubano — la captura de la tarde cubana NO se fecha mañana', async () => {
    // Reloj fijado: 2026-10-26T00:30:00Z = 25 oct 20:30 en Cuba (CDT).
    // El código anterior (toISOString) habría usado rate_date='2026-10-26'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T00:30:00Z'));
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: null,
      mlc: null,
      sourceUpdatedAt: '2026-10-25T20:03:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.captured[0].date).toBe('2026-10-25'); // fecha civil de Cuba
    expect(upsertsTo()[0].body.rate_date).toBe('2026-10-25');
  });

  it('caso 5: DESPUÉS del cambio de día civil cubano — rate_date es el día cubano nuevo', async () => {
    // Reloj fijado: 2026-10-26T05:30:00Z = 26 oct 01:30 en Cuba (CDT).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T05:30:00Z'));
    mockDiviza.mockResolvedValue({
      usd: 841,
      eur: null,
      mlc: null,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.captured[0].date).toBe('2026-10-26');
    expect(upsertsTo()[0].body.rate_date).toBe('2026-10-26');
  });
});

describe('captureForDate — BCC + informal Diviza (cron y manual comparten)', () => {
  it('hoy (operativo): captura BCC 3 segmentos × 2 monedas + informal Diviza 3 monedas', async () => {
    const today = getOperativeDate();
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: 930,
      mlc: 691.62,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      return jsonResponse(201, {});
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);

    // BCC: 3 segmentos × 2 monedas = 6 filas
    const bcc = result.captured.filter(c => c.source === 'BCC');
    expect(bcc).toHaveLength(6);
    expect(bcc.every(c => c.capture_method === 'real')).toBe(true);
    expect(new Set(bcc.map(c => c.segment))).toEqual(new Set(['1', '2', '3']));

    // Informal Diviza: 3 monedas
    const informal = result.captured.filter(c => c.source === 'Diviza');
    expect(informal).toHaveLength(3);
    expect(informal.every(c => c.capture_method === 'real')).toBe(true);

    // Ninguna fila 'elToque' nueva (procedencia verdadera)
    expect(result.captured.some(c => c.source === 'elToque')).toBe(false);

    // Estado por fuente: ambas OK e independientes
    expect(result.bcc.ok).toBe(true);
    expect(result.diviza.ok).toBe(true);
    expect(result.diviza.attempted).toBe(true);
  });

  it('FIX BCC histórico: /historico devuelve ARRAY PURO sin codigoMoneda → se parsea y se inyecta la moneda', async () => {
    // Antes del fix: data.tasas era undefined → null → «No BCC data».
    const pastDate = addDaysToDateString(getOperativeDate(), -2);
    mockDiviza.mockResolvedValue(null);
    installFetch(async (url) => {
      if (url.includes('historico')) {
        // Respuesta REAL del endpoint: array puro, sin envoltura {tasas},
        // sin codigoMoneda (la moneda va en el query param).
        if (url.includes('codigoMoneda=USD')) return jsonResponse(200, BCC_HISTORICO_USD);
        return jsonResponse(200, [
          { fecha: pastDate, tasaOficial: 26.88, tasaPublica: 134.38, tasaEspecial: 832 },
        ]);
      }
      return jsonResponse(201, {});
    });

    const result = await captureForDate(pastDate, SUPABASE_URL, SERVICE_KEY);

    const bcc = result.captured.filter(c => c.source === 'BCC');
    // USD 3 segmentos + EUR 3 segmentos = 6 filas (antes: 0, «No BCC data»)
    expect(bcc).toHaveLength(6);
    expect(bcc.filter(c => c.currency === 'USD').map(c => c.rate).sort((a, b) => a - b)).toEqual([24, 120, 725]);
    expect(bcc.every(c => c.date === pastDate)).toBe(true);
    expect(result.bcc.ok).toBe(true);
    // La fecha pasada NO intenta Diviza (no tiene serie histórica)
    expect(mockDiviza).not.toHaveBeenCalled();
    expect(result.diviza.attempted).toBe(false);
  });

  it('FIX BCC histórico: fechaFin = MISMO día (no arrastra la fila del día siguiente)', async () => {
    const pastDate = addDaysToDateString(getOperativeDate(), -2);
    mockDiviza.mockResolvedValue(null);
    const historicoUrls: string[] = [];
    installFetch(async (url) => {
      if (url.includes('historico')) {
        historicoUrls.push(url);
        return jsonResponse(200, BCC_HISTORICO_USD);
      }
      return jsonResponse(201, {});
    });

    await captureForDate(pastDate, SUPABASE_URL, SERVICE_KEY);

    expect(historicoUrls).toHaveLength(2); // USD + EUR
    for (const u of historicoUrls) {
      // Ambos extremos son el mismo día: rango de UN día exacto
      expect(u).toContain(`fechaInicio=${pastDate}&fechaFin=${pastDate}`);
    }
  });

  it('fecha pasada: SOLO BCC histórico — sin informal retroactivo inventado', async () => {
    const pastDate = '2026-10-01';
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: 930,
      mlc: 691.62,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) {
        expect(url).toContain('historico');
        return jsonResponse(200, { tasas: [{ codigoMoneda: 'USD', tasaEspecial: 375 }] });
      }
      return jsonResponse(201, {});
    });

    const result = await captureForDate(pastDate, SUPABASE_URL, SERVICE_KEY);

    // Diviza no se invoca para fechas pasadas (no tiene serie histórica)
    expect(mockDiviza).not.toHaveBeenCalled();
    const informal = result.captured.filter(c => c.source !== 'BCC');
    expect(informal).toHaveLength(0);
    expect(result.captured.filter(c => c.source === 'BCC').length).toBeGreaterThan(0);
  });

  it('caso 3: BCC OK + Diviza caído → BCC se guarda, Diviza falla IDENTIFICADO por separado', async () => {
    const today = getOperativeDate();
    mockDiviza.mockResolvedValue(null);
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      return jsonResponse(201, {});
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);

    expect(result.captured.filter(c => c.source === 'BCC')).toHaveLength(6);
    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(0);
    // El estado de Diviza es explícito e independiente del éxito de BCC
    expect(result.bcc.ok).toBe(true);
    expect(result.diviza.ok).toBe(false);
    expect(result.diviza.attempted).toBe(true);
    expect(result.diviza.errors.some(e => e.includes('Diviza'))).toBe(true);
    expect(result.errors.some(e => e.includes('Diviza'))).toBe(true);
  });

  it('caso 4: BCC caído + Diviza operativa → informal se captura y el fallo oficial queda separado', async () => {
    const today = getOperativeDate();
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: 925,
      mlc: 692.79,
      sourceUpdatedAt: '2026-10-25T20:03:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(500, {});
      return jsonResponse(201, {});
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);

    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(3);
    expect(result.bcc.ok).toBe(false);
    expect(result.diviza.ok).toBe(true);
    expect(result.divizaSourceUpdatedAt).toBe('2026-10-25T20:03:00-04:00');
    expect(result.bcc.errors.some(e => e.includes('No BCC data'))).toBe(true);
  });

  it('caso 9: BCC histórico con HTML/body inválido → estado honesto sin filas', async () => {
    const pastDate = addDaysToDateString(getOperativeDate(), -3);
    mockDiviza.mockResolvedValue(null);
    installFetch(async (url) => {
      if (url.includes('historico')) return jsonResponse(200, { error: 'unexpected' });
      return jsonResponse(201, {});
    });

    const result = await captureForDate(pastDate, SUPABASE_URL, SERVICE_KEY);

    expect(result.captured).toHaveLength(0);
    expect(result.bcc.ok).toBe(false);
    expect(result.bcc.errors.some(e => e.includes('No BCC data'))).toBe(true);
  });

  it('caso 9: error de persistencia (Supabase 4xx) → la fuente falla sin éxito falso', async () => {
    const today = getOperativeDate();
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: null,
      mlc: null,
      sourceUpdatedAt: null,
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      // Supabase rechaza el upsert
      return jsonResponse(400, { message: 'duplicate key' });
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);

    expect(result.bcc.ok).toBe(false);
    expect(result.bcc.rows).toBe(0);
    expect(result.diviza.ok).toBe(false);
    expect(result.diviza.errors.some(e => e.includes('Diviza upsert failed'))).toBe(true);
    expect(result.captured).toHaveLength(0);
  });
});

describe('captureDateRange — backfill operativo con estado por fuente', () => {
  it('days=1 procesa la FECHA OPERATIVA y combina BCC + Diviza', async () => {
    const today = getOperativeDate();
    mockDiviza.mockResolvedValue({
      usd: 839,
      eur: 930,
      mlc: 691.62,
      sourceUpdatedAt: '2026-10-26T12:30:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      return jsonResponse(201, {});
    });

    const result = await captureDateRange(1, SUPABASE_URL, SERVICE_KEY, 3);
    expect(result.datesProcessed).toEqual([today]);
    expect(result.captured.filter(c => c.source === 'BCC')).toHaveLength(6);
    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(3);
    // Contrato nuevo: fecha operativa + estado por fuente + sello Diviza
    expect(result.operativeDate).toBe(today);
    expect(result.bcc.ok).toBe(true);
    expect(result.diviza.ok).toBe(true);
    expect(result.divizaSourceUpdatedAt).toBe('2026-10-26T12:30:00-04:00');
  });

  it('days=7: el intervalo termina en la fecha operativa (civil de Cuba) y el backfill BCC histórico funciona', async () => {
    // Reloj fijado en la ventana de divergencia UTC/Havana.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T00:30:00Z')); // Cuba: 25 oct 20:30

    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: 925,
      mlc: 692.79,
      sourceUpdatedAt: '2026-10-25T20:03:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async (url) => {
      if (url.includes('/activas')) return jsonResponse(200, BCC_ACTIVAS);
      if (url.includes('historico')) {
        // Cada día pasado devuelve sus 3 segmentos (array puro real).
        const m = url.match(/fechaInicio=(\d{4}-\d{2}-\d{2})/);
        const d = m ? m[1] : '2026-10-20';
        return jsonResponse(200, [
          { fecha: d, tasaOficial: 24, tasaPublica: 120, tasaEspecial: 740 },
        ]);
      }
      return jsonResponse(201, {});
    });

    const result = await captureDateRange(7, SUPABASE_URL, SERVICE_KEY, 7);

    // El rango es 19..25 de octubre (fecha civil de Cuba), NO 20..26 (UTC).
    expect(result.operativeDate).toBe('2026-10-25');
    expect(result.datesProcessed[0]).toBe('2026-10-19');
    expect(result.datesProcessed[result.datesProcessed.length - 1]).toBe('2026-10-25');
    expect(result.datesProcessed).not.toContain('2026-10-26');
    // BCC: 6 fechas pasadas × 1 segmento-triple × ... cada pasada devuelve 1
    // entrada con 3 segmentos → 6 filas por fecha pasada + 6 de /activas
    expect(result.captured.filter(c => c.source === 'BCC').length).toBe(6 * 7);
    // Diviza SOLO para la fecha operativa (25) — sin doble captura
    const diviza = result.captured.filter(c => c.source === 'Diviza');
    expect(diviza).toHaveLength(3);
    expect(new Set(diviza.map(c => c.date))).toEqual(new Set(['2026-10-25']));
    expect(result.diviza.ok).toBe(true);
    expect(result.bcc.ok).toBe(true);
  });

  it('caso 3 (rango): BCC OK + Diviza fallido → parcial identificable en el contrato', async () => {
    mockDiviza.mockResolvedValue(null);
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      return jsonResponse(201, {});
    });

    const result = await captureDateRange(1, SUPABASE_URL, SERVICE_KEY, 3);

    expect(result.bcc.ok).toBe(true);
    expect(result.diviza.ok).toBe(false);
    expect(result.divizaSourceUpdatedAt).toBeNull();
    // El error de Diviza vive en su estado propio, no diluido en BCC
    expect(result.diviza.errors.length).toBeGreaterThan(0);
  });

  it('caso 7: recaptura del mismo día → mismos upserts idempotentes, sin conflicto ni duplicado', async () => {
    mockDiviza.mockResolvedValue({
      usd: 840,
      eur: 925,
      mlc: 692.79,
      sourceUpdatedAt: '2026-10-25T20:03:00-04:00',
      capturedAt: new Date().toISOString(),
      sourceUrl: 'https://cubadivisas.com/',
      strategy: 'conv-data-json',
    });
    installFetch(async () => jsonResponse(200, [{}])); // merge-duplicates OK

    const first = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);
    const second = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    // Ambas pasadas capturan las 3 monedas con la MISMA clave natural
    expect(first.captured).toHaveLength(3);
    expect(second.captured).toHaveLength(3);
    expect(second.errors).toHaveLength(0); // sin 409 ni conflicto
    // Claves naturales idénticas → la fila se ACTUALIZA (no se duplica)
    const key = (c: any) => `${c.date}|${c.currency}|${c.source}|${c.segment}`;
    expect(first.captured.map(key).sort()).toEqual(second.captured.map(key).sort());
    // Los upserts llevaron la clave natural en on_conflict (UPDATE, no INSERT)
    for (const u of upsertsTo()) {
      expect(u.url).toContain('on_conflict=rate_date,currency,source,segment');
    }
  });
});

describe('contrato de fuentes informales (IC-DIVIZA-003)', () => {
  it('ACTIVAS = [\'Diviza\'] EXACTAMENTE — la única con derecho a vigencia', () => {
    // El registro único vive en exchange-sources.ts; la lib de captura lo
    // re-exporta para que cron/endpoints/tests tengan UNA fuente de verdad.
    expect(INFORMAL_ACTIVE_SOURCES).toEqual(['Diviza']);
  });

  it('HISTÓRICAS = [\'elToque\'] EXACTAMENTE — archivo, jamás vigente', () => {
    expect(INFORMAL_HISTORICAL_SOURCES).toEqual(['elToque']);
  });

  it('las listas son DISJUNTAS (una fuente no puede ser activa e histórica)', () => {
    const activas = INFORMAL_ACTIVE_SOURCES as readonly string[];
    for (const h of INFORMAL_HISTORICAL_SOURCES) {
      expect(activas).not.toContain(h);
    }
  });
});
