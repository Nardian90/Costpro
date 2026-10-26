/**
 * exchange-rates-refresh.test.ts — Pruebas del POST /api/exchange-rates/refresh
 * tras IC-DIVIZA-002 (misión §4: hacer fiable el botón «Actualizar BD (7 días)»).
 *
 * Cubre:
 *   - (3) BCC OK + Diviza fallido → 200 con partial=true y el estado y error
 *     de Diviza EXPLÍCITOS (jamás un «Captura completada» genérico).
 *   - (4) Diviza OK + BCC fallido → 200 con partial=true y fallo oficial separado.
 *   - Éxito completo → 200 partial=false con ambas fuentes y la tasa informal.
 *   - Ambas fallidas → 502 honesto (éxito NUNCA falso).
 *   - 403 para no-admin; 500 sin credenciales.
 *   - Campos legados (captured_count, dates_processed, details) conservados
 *     para el cron y clientes existentes.
 *   - operative_date en la respuesta (fecha civil de Cuba).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/exchange-rates/refresh/route';

// ── Mock de sesión (mutable por test) ──
const mockSession = { value: { id: 'u-1', role: 'admin', user: { id: 'u-1', role: 'admin' } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));

// ── Mock de la lib compartida (captureDateRange) ──
const captureResult = { value: null as any };
vi.mock('@/lib/exchange-capture', () => ({
  captureDateRange: vi.fn(async () => captureResult.value),
}));

const ENV_BACKUP: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.value = { id: 'u-1', role: 'admin', user: { id: 'u-1', role: 'admin' } };
  captureResult.value = null;
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

function makeRequest(days = '7'): any {
  return {
    method: 'POST',
    headers: new Map(),
    url: `http://localhost/api/exchange-rates/refresh?days=${days}`,
    nextUrl: { pathname: '/api/exchange-rates/refresh' },
  };
}

function bothOkResult() {
  return {
    captured: [
      { date: '2026-10-25', currency: 'USD', source: 'BCC', segment: '1', rate: 24, capture_method: 'real' },
      { date: '2026-10-25', currency: 'USD', source: 'BCC', segment: '2', rate: 120, capture_method: 'real' },
      { date: '2026-10-25', currency: 'USD', source: 'BCC', segment: '3', rate: 743, capture_method: 'real' },
      { date: '2026-10-25', currency: 'USD', source: 'Diviza', segment: '3', rate: 840, capture_method: 'real' },
      { date: '2026-10-25', currency: 'EUR', source: 'Diviza', segment: '3', rate: 925, capture_method: 'real' },
      { date: '2026-10-25', currency: 'MLC', source: 'Diviza', segment: '3', rate: 692.79, capture_method: 'real' },
    ],
    errors: [],
    datesProcessed: ['2026-10-25'],
    operativeDate: '2026-10-25',
    bcc: { ok: true, rows: 6, errors: [], attempted: true },
    diviza: { ok: true, rows: 3, errors: [], attempted: true },
    divizaSourceUpdatedAt: '2026-10-25T20:03:00-04:00',
  };
}

describe('POST /api/exchange-rates/refresh?days=7 — estado por fuente', () => {
  it('éxito completo: 200 con success, partial=false, ambas fuentes y la tasa Diviza', async () => {
    captureResult.value = bothOkResult();

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.partial).toBe(false);
    expect(json.operative_date).toBe('2026-10-25');
    // Estado separado por fuente (misión §4)
    expect(json.bcc).toMatchObject({ ok: true, rows: 6 });
    expect(json.bcc.errors).toEqual([]);
    expect(json.diviza).toMatchObject({ ok: true, rows: 3, attempted: true });
    expect(json.diviza.rates).toEqual({ usd: 840, eur: 925, mlc: 692.79 });
    expect(json.diviza.source_updated_at).toBe('2026-10-25T20:03:00-04:00');
    // Campos legados conservados (cron / compatibilidad)
    expect(json.captured_count).toBe(6);
    expect(json.dates_processed).toEqual(['2026-10-25']);
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.mode).toBe('backfill-7d');
    expect(json.triggered_by).toBe('u-1');
  });

  it('caso 3: BCC OK + Diviza fallido → 200 partial=true con el error de Diviza EXPLÍCITO', async () => {
    captureResult.value = {
      captured: [
        { date: '2026-10-25', currency: 'USD', source: 'BCC', segment: '1', rate: 24, capture_method: 'real' },
      ],
      errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
      datesProcessed: ['2026-10-25'],
      operativeDate: '2026-10-25',
      bcc: { ok: true, rows: 6, errors: [], attempted: true },
      diviza: {
        ok: false,
        rows: 0,
        attempted: true,
        errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
      },
      divizaSourceUpdatedAt: null,
    };

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    // Éxito parcial EXPLÍCITO: BCC ok + Diviza fallido, sin dilución
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.bcc.ok).toBe(true);
    expect(json.diviza.ok).toBe(false);
    expect(json.diviza.rates.usd).toBeNull(); // nunca fabricada
    expect(json.diviza.errors[0]).toMatch(/Diviza: no se pudo obtener/i);
    expect(json.diviza.source_updated_at).toBeNull();
    // El errors[] legado también lo lleva (doble vía)
    expect(json.errors).toEqual(['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)']);
  });

  it('caso 4: Diviza OK + BCC fallido → 200 partial=true con el fallo oficial por separado', async () => {
    captureResult.value = {
      captured: [
        { date: '2026-10-25', currency: 'USD', source: 'Diviza', segment: '3', rate: 840, capture_method: 'real' },
      ],
      errors: ['No BCC data for 2026-10-25'],
      datesProcessed: ['2026-10-25'],
      operativeDate: '2026-10-25',
      bcc: { ok: false, rows: 0, errors: ['No BCC data for 2026-10-25'], attempted: true },
      diviza: { ok: true, rows: 3, errors: [], attempted: true },
      divizaSourceUpdatedAt: '2026-10-25T20:03:00-04:00',
    };

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.partial).toBe(true);
    // La informal sigue reportándose como capturada y visible
    expect(json.diviza.ok).toBe(true);
    expect(json.diviza.rates.usd).toBe(840);
    // El fallo oficial queda identificado por separado
    expect(json.bcc.ok).toBe(false);
    expect(json.bcc.errors).toEqual(['No BCC data for 2026-10-25']);
  });

  it('ambas fuentes fallidas → 502 honesto (éxito NUNCA falso)', async () => {
    captureResult.value = {
      captured: [],
      errors: ['No BCC data for 2026-10-25', 'Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
      datesProcessed: ['2026-10-25'],
      operativeDate: '2026-10-25',
      bcc: { ok: false, rows: 0, errors: ['No BCC data for 2026-10-25'], attempted: true },
      diviza: {
        ok: false,
        rows: 0,
        attempted: true,
        errors: ['Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)'],
      },
      divizaSourceUpdatedAt: null,
    };

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.partial).toBe(false);
    expect(json.error).toMatch(/Captura fallida: ni BCC ni Diviza/i);
    // El desglose del 502 identifica qué falló en cada fuente
    expect(json.bcc.ok).toBe(false);
    expect(json.diviza.ok).toBe(false);
  });

  it('403 para sesión no-admin (defense in depth con la UI)', async () => {
    mockSession.value = { id: 'u-2', role: 'cashier', user: { id: 'u-2', role: 'cashier' } };

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/solo admin/i);
  });

  it('500 con CONFIG_ERROR cuando faltan credenciales de Supabase', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await POST(makeRequest('7'));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Config missing/i);
  });

  it('days se acota al rango 1..30 (respeta el timeout de Vercel)', async () => {
    captureResult.value = bothOkResult();

    const res = await POST(makeRequest('99'));
    const json = await res.json();

    // 99 → acotado a 30 (el modo legado lo refleja)
    expect(json.mode).toBe('backfill-30d');
  });
});
