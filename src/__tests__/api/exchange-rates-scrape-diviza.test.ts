/**
 * exchange-rates-scrape-diviza.test.ts — Pruebas de la captura manual informal.
 *
 * Misión IC-DIVIZA (2026-10-26). Verifica:
 *  - Solo admin puede disparar la captura (403 para otros roles).
 *  - Llama a captureInformalToday (lógica compartida con el cron — única vía).
 *  - Éxito: 200 con provider='Diviza', rates y sourceUpdatedAt.
 *  - Fallo del proveedor: 502 con mensaje claro — NUNCA éxito falso.
 *  - Fallo de persistencia: sin éxito falso.
 *  - Credenciales ausentes: CONFIG_ERROR 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/exchange-rates/scrape-diviza/route';

const mockSession = { value: { id: 'u-1', role: 'admin' } as any };
const captureResult = {
  value: {
    captured: [],
    errors: [],
    provider: null as string | null,
    sourceUpdatedAt: null as string | null,
  },
};

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: mockSession.value }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/exchange-capture', () => ({
  captureInformalToday: vi.fn(async () => captureResult.value),
}));

const ENV_BACKUP: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.value = { id: 'u-1', role: 'admin' };
  captureResult.value = { captured: [], errors: [], provider: null, sourceUpdatedAt: null };
  for (const k of Object.keys(ENV_BACKUP)) delete process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

afterAll(() => {
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

import { afterAll } from 'vitest';

function makeRequest(): Request {
  return { method: 'POST', headers: new Map(), url: 'http://localhost/api/exchange-rates/scrape-diviza' } as any;
}

describe('POST /api/exchange-rates/scrape-diviza', () => {
  it('rechaza 403 a usuarios no admin', async () => {
    mockSession.value = { id: 'u-2', role: 'clerk' };
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/solo admin/i);
  });

  it('éxito: 200 con provider Diviza, tasas y hora de la fuente', async () => {
    captureResult.value = {
      captured: [
        { date: '2026-10-26', currency: 'USD', source: 'Diviza', segment: '3', rate: 839, capture_method: 'real' },
        { date: '2026-10-26', currency: 'EUR', source: 'Diviza', segment: '3', rate: 930, capture_method: 'real' },
        { date: '2026-10-26', currency: 'MLC', source: 'Diviza', segment: '3', rate: 691.62, capture_method: 'real' },
      ],
      errors: [],
      provider: 'Diviza',
      sourceUpdatedAt: '2026-10-26T12:30:00-04:00',
    };

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.provider).toBe('Diviza');
    expect(body.sourceUrl).toBe('https://cubadivisas.com/');
    expect(body.captured).toBe(3);
    expect(body.rates.usd).toBe(839);
    expect(body.rates.eur).toBe(930);
    expect(body.rates.mlc).toBe(691.62);
    // Momento de la fuente distinto de la captura
    expect(body.sourceUpdatedAt).toBe('2026-10-26T12:30:00-04:00');
    expect(body.message).toMatch(/Diviza/i);
  });

  it('proveedor caído: 502 con mensaje claro — nunca éxito falso', async () => {
    captureResult.value = {
      captured: [],
      errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
      provider: null,
      sourceUpdatedAt: null,
    };

    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.error).toMatch(/no devolvió una cotización válida/i);
    expect(body.error).toMatch(/No se guardó ningún valor/i);
    expect(body.hint).toMatch(/histórico ya almacenado sigue disponible/i);
  });

  it('monedas ausentes (EUR/MLC null) no se fabrican en la respuesta', async () => {
    captureResult.value = {
      captured: [
        { date: '2026-10-26', currency: 'USD', source: 'Diviza', segment: '3', rate: 839, capture_method: 'real' },
      ],
      errors: [],
      provider: 'Diviza',
      sourceUpdatedAt: null,
    };

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates.usd).toBe(839);
    expect(body.rates.eur).toBeNull();
    expect(body.rates.mlc).toBeNull();
  });

  it('sin credenciales Supabase: CONFIG_ERROR 500', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('CONFIG_ERROR');
  });

  it('usa captureInformalToday — la MISMA lógica del cron (única vía)', async () => {
    const { captureInformalToday } = await import('@/lib/exchange-capture');
    await POST(makeRequest());
    expect(captureInformalToday).toHaveBeenCalledWith('https://test.supabase.co', 'test-key');
  });
});
