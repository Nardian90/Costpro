/**
 * exchange-capture-diviza.test.ts — Pruebas de la lógica compartida de captura
 * tras la sustitución de solucionescuba.com por Diviza (misión IC-DIVIZA).
 *
 * Cubre los casos obligatorios:
 *  - captureInformalToday usa el adaptador Diviza y persiste source='Diviza'.
 *  - EUR/MLC ausentes NO se fabrican (ni BCC×1.15 ni MLC=USD).
 *  - Diviza caído → NO se persiste NADA (carry-forward del caller).
 *  - captureForDate(hoy) = BCC + informal Diviza (misma lógica para cron y manual).
 *  - captureForDate(fecha pasada) = solo BCC (sin informal retroactivo inventado).
 *  - La captura exitosa registra capture_method='real' y procedencia verdadera.
 *  - BCC sigue capturándose por segmentos con source='BCC'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  captureForDate,
  captureInformalToday,
  captureDateRange,
  INFORMAL_SOURCES,
} from '@/lib/exchange-capture';

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

beforeEach(() => {
  vi.clearAllMocks();
  fetchLog = [];
  mockDiviza.mockReset();
  fetchHandler = null;
});

afterEach(() => {
  vi.restoreAllMocks();
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

    // Los upserts REST llevan source='Diviza' y capture_method='real'
    const upserts = fetchLog.filter(l => l.url.includes('/rest/v1/exchange_rates'));
    expect(upserts).toHaveLength(3);
    for (const u of upserts) {
      expect(u.body.source).toBe('Diviza');
      expect(u.body.capture_method).toBe('real');
      expect(u.body.rate).toBeGreaterThan(0);
    }
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
    expect(fetchLog.filter(l => l.url.includes('/rest/v1/exchange_rates'))).toHaveLength(1);
  });

  it('Diviza caído → NO persiste nada y reporta error (sin estimaciones)', async () => {
    mockDiviza.mockResolvedValue(null);
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);

    expect(result.provider).toBeNull();
    expect(result.captured).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    // Regla inviolable: cero escrituras cuando no hay cotización válida
    expect(fetchLog.filter(l => l.url.includes('/rest/v1/exchange_rates'))).toHaveLength(0);
  });

  it('error de red del proveedor → sin lanzar y sin escrituras', async () => {
    mockDiviza.mockRejectedValue(new Error('timeout'));
    installFetch(async () => jsonResponse(201, {}));

    const result = await captureInformalToday(SUPABASE_URL, SERVICE_KEY);
    expect(result.provider).toBeNull();
    expect(result.captured).toHaveLength(0);
    expect(fetchLog.filter(l => l.url.includes('/rest/v1/exchange_rates'))).toHaveLength(0);
  });
});

describe('captureForDate — BCC + informal Diviza (cron y manual comparten)', () => {
  const today = new Date().toISOString().split('T')[0];

  it('hoy: captura BCC 3 segmentos × 2 monedas + informal Diviza 3 monedas', async () => {
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

  it('Diviza caído hoy: BCC se guarda igual; informal sin escrituras', async () => {
    mockDiviza.mockResolvedValue(null);
    installFetch(async (url) => {
      if (url.includes('api.bc.gob.cu')) return jsonResponse(200, BCC_ACTIVAS);
      return jsonResponse(201, {});
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);

    expect(result.captured.filter(c => c.source === 'BCC')).toHaveLength(6);
    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(0);
    expect(result.errors.some(e => e.includes('Diviza'))).toBe(true);
  });

  it('BCC caído + Diviza operativa: informal se captura igual', async () => {
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
      if (url.includes('api.bc.gob.cu')) return jsonResponse(500, {});
      return jsonResponse(201, {});
    });

    const result = await captureForDate(today, SUPABASE_URL, SERVICE_KEY);
    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(3);
    expect(result.errors.some(e => e.includes('No BCC data'))).toBe(true);
  });
});

describe('captureDateRange — backfill con concurrencia', () => {
  it('days=1 procesa hoy y combina BCC + Diviza', async () => {
    const today = new Date().toISOString().split('T')[0];
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

    const result = await captureDateRange(1, SUPABASE_URL, SERVICE_KEY, 3);
    expect(result.datesProcessed).toEqual([today]);
    expect(result.captured.filter(c => c.source === 'BCC')).toHaveLength(6);
    expect(result.captured.filter(c => c.source === 'Diviza')).toHaveLength(3);
  });
});

describe('contrato de fuentes informales', () => {
  it('INFORMAL_SOURCES declara Diviza (activa) y elToque (histórica)', () => {
    expect(INFORMAL_SOURCES).toContain('Diviza');
    expect(INFORMAL_SOURCES).toContain('elToque');
  });
});
