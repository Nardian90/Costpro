/**
 * exchange-rates-get.test.ts — Pruebas del GET /api/exchange-rates tras
 * IC-DIVIZA-002 (misión §5: garantizar la visualización).
 *
 * Cubre los casos de aceptación que atañen a la API de consulta:
 *   - (6) Una fila histórica de elToque no desplaza una captura Diviza más
 *     reciente: informal_latest excluye las virtuales carry-forward y
 *     resuelve por (rate_date DESC, captured_at DESC) sobre filas REALES.
 *   - (5) operative_date = fecha civil de Cuba (America/Havana), la misma
 *     que la vista usa para etiquetas de antigüedad.
 *   - Las filas virtuales carry-forward CONSERVAN el captured_at original
 *     (antes se fabricaba «ahora» y desplazaban a las reales en la vista).
 *   - (8) La API devuelve la fila guardada con source_updated_at para que
 *     la tarjeta use exactamente esa cotización.
 *   - (9) Sin cotizaciones → respuesta honesta vacía; error de Supabase →
 *     500 con el mensaje (nunca datos inventados).
 *   - (10) El histórico elToque se devuelve intacto (sin re-atribución ni
 *     re-fechado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/exchange-rates/route';
import { getOperativeDate, addDaysToDateString, byOperativeDateFirstThenFreshness } from '@/lib/operative-date';

// ── Mock de sesión (withAuth inyecta la sesión mockeada) ──
const mockSession = { value: { id: 'u-1', role: 'admin', user: { id: 'u-1', role: 'admin' } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));

// ── Mock de Supabase admin client (cadena chainable) ──
type Row = Record<string, any>;
let queryResult: { data: Row[] | null; error: { message: string } | null } = { data: [], error: null };

const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  in: vi.fn(() => chain),
  gte: vi.fn(() => chain),
  order: vi.fn(() => chain),
  then: (resolve: any, reject: any) =>
    Promise.resolve({ data: queryResult.data, error: queryResult.error }).then(resolve, reject),
};
// chain debe ser await-able Y chainable: then() devuelve el resultado.

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => chain),
  })),
}));

const ENV_BACKUP: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = { data: [], error: null };
  ENV_BACKUP.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  ENV_BACKUP.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function makeRequest(params = '?days=90&segment=3'): any {
  return {
    method: 'GET',
    headers: new Map(),
    url: `http://localhost/api/exchange-rates${params}`,
    nextUrl: { pathname: '/api/exchange-rates' },
  };
}

const TODAY = getOperativeDate();
const YESTERDAY = addDaysToDateString(TODAY, -1);

function divizaRow(date: string, rate: number, currency = 'USD', extra: Row = {}): Row {
  return {
    id: `diviza-${date}-${currency}`,
    rate_date: date,
    captured_at: `${date}T00:28:51Z`,
    currency,
    source: 'Diviza',
    segment: '3',
    rate,
    capture_method: 'real',
    source_updated_at: '2026-10-25T20:03:00-04:00',
    ...extra,
  };
}

function elToqueRow(date: string, rate: number, currency = 'USD'): Row {
  return {
    id: `eltoque-${date}-${currency}`,
    rate_date: date,
    captured_at: `${date}T03:32:28Z`,
    currency,
    source: 'elToque',
    segment: '3',
    rate,
    capture_method: 'real',
  };
}

function bccRow(date: string, rate: number, currency = 'USD', segment = '3'): Row {
  return {
    id: `bcc-${date}-${currency}-${segment}`,
    rate_date: date,
    captured_at: `${date}T00:11:42Z`,
    currency,
    source: 'BCC',
    segment,
    rate,
    capture_method: 'real',
  };
}

describe('GET /api/exchange-rates — fecha operativa y selección del informal vigente', () => {
  it('expone operative_date = fecha civil de Cuba (America/Havana)', async () => {
    queryResult.data = [bccRow(TODAY, 380)];

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.operative_date).toBe(getOperativeDate());
  });

  it('caso 6: informal_latest resuelve la Diviza REAL — la virtual elToque no la desplaza', async () => {
    // Escenario REAL de producción: Diviza real de hoy + virtual elToque
    // (fuente muerta 2026-07-28) con captured_at fabricado «ahora».
    const elToqueJulio = elToqueRow('2026-07-28', 675);
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(TODAY, 840),
      elToqueJulio,
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    expect(res.status).toBe(200);
    // La vigente es la Diviza real 840, no la elToque 675
    expect(json.informal_latest).toBeDefined();
    expect(json.informal_latest.rate).toBe(840);
    expect(json.informal_latest.source).toBe('Diviza');
    expect(json.informal_latest.capture_method).toBe('real');
    expect(json.informal_latest.source_updated_at).toBe('2026-10-25T20:03:00-04:00');
    // La virtual elToque existe para continuidad del gráfico (rate_date hoy)
    const virtualElToque = (json.rates as Row[]).find(
      r => r.source === 'elToque' && r.capture_method === 'carry_forward',
    );
    expect(virtualElToque).toBeDefined();
    expect(virtualElToque!.rate).toBe(675);
    expect(virtualElToque!.original_rate_date).toBe('2026-07-28');
  });

  it('las virtuales carry-forward CONSERVAN el captured_at original (no «ahora»)', async () => {
    const elToqueJulio = elToqueRow('2026-07-28', 675);
    queryResult.data = [bccRow(TODAY, 743), elToqueJulio];

    const before = new Date().toISOString();
    const res = await GET(makeRequest());
    const after = new Date().toISOString();
    const json = await res.json();

    const virtual = (json.rates as Row[]).find(
      (r: Row) => r.capture_method === 'carry_forward' && r.source === 'elToque' && r.currency === 'USD',
    );
    expect(virtual).toBeDefined();
    // El captured_at de la virtual es el ORIGINAL (2026-07-28), jamás un
    // timestamp entre before/after (que era el bug que desplazaba a Diviza).
    expect(virtual!.captured_at).toBe('2026-07-28T03:32:28Z');
    expect(virtual!.captured_at < before).toBe(true);
    expect(after > virtual!.captured_at).toBe(true);
  });

  it('caso 8: la API devuelve la fila Diviza guardada con sus metadatos exactos', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(TODAY, 840),
      divizaRow(TODAY, 925, 'EUR'),
      divizaRow(TODAY, 692.79, 'MLC'),
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    // La fila USD de Diviza llega EXACTAMENTE como se persistió
    const divizaUsd = (json.rates as Row[]).find(
      (r: Row) => r.source === 'Diviza' && r.currency === 'USD',
    );
    expect(divizaUsd).toMatchObject({
      rate: 840,
      rate_date: TODAY,
      source: 'Diviza',
      segment: '3',
      capture_method: 'real',
      source_updated_at: '2026-10-25T20:03:00-04:00',
    });
    expect(json.informal_latest.rate).toBe(840);
  });

  it('sin cotizaciones informales → informal_latest ausente y rates vacío (estado honesto)', async () => {
    queryResult.data = [bccRow(TODAY, 743)];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.informal_latest).toBeUndefined();
    // Sin datos informales reales, la virtual NO se crea a partir de nada
    expect((json.rates as Row[]).filter(r => r.source !== 'BCC')).toHaveLength(0);
  });

  it('caso 9: error de Supabase → 500 con el mensaje (nunca datos inventados)', async () => {
    queryResult = { data: null, error: { message: 'relation "exchange_rates" does not exist' } };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain('does not exist');
  });

  it('caso 10: el histórico elToque se devuelve INTACTO (sin re-atribución ni re-fechado)', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(TODAY, 840),
      elToqueRow('2026-07-28', 675),
      elToqueRow('2026-07-27', 675),
    ];

    const res = await GET(makeRequest());
    const json = await res.json();

    const reales = (json.rates as Row[]).filter(r => r.source === 'elToque' && r.capture_method !== 'carry_forward');
    expect(reales).toHaveLength(2);
    // Fechas y procedencia originales conservadas
    expect(reales.map(r => r.rate_date).sort()).toEqual(['2026-07-27', '2026-07-28']);
    expect(reales.every(r => r.source === 'elToque')).toBe(true);
  });

  it('la vigente de varios días: Diviza de HOY gana a Diviza de ayer (frescura por fecha)', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(YESTERDAY, 838),
      divizaRow(TODAY, 840),
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    expect(json.informal_latest.rate).toBe(840);
    expect(json.informal_latest.rate_date).toBe(TODAY);
  });

  it('mismo día, dos capturas: gana la de captured_at más reciente (recaptura Diviza)', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      { ...divizaRow(TODAY, 839), captured_at: `${TODAY}T19:55:00Z` },
      { ...divizaRow(TODAY, 840), captured_at: `${TODAY}T23:28:51Z` },
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    expect(json.informal_latest.rate).toBe(840); // la recaptura más fresca
  });

  it('fila FUTURA legado (bug UTC) no gana a la fila de la fecha operativa (prioridad operativa)', async () => {
    // Estado real de producción durante la validación integral: filas
    // rate_date=mañana (capturadas de noche en Cuba, bug UTC) + fila correcta
    // de la fecha operativa. informal_latest debe resolver la de HOY.
    const TOMORROW = addDaysToDateString(TODAY, 1);
    queryResult.data = [
      bccRow(TODAY, 743),
      { ...divizaRow(TOMORROW, 840), captured_at: `${TOMORROW}T00:28:51Z` },
      { ...divizaRow(TODAY, 840), captured_at: `${TODAY}T01:18:36Z` },
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    expect(json.informal_latest.rate_date).toBe(TODAY); // la de la fecha operativa
    expect(json.informal_latest.rate).toBe(840);
  });
});

describe('byOperativeDateFirstThenFreshness — comparador compartido vista/API', () => {
  it('la fila de la fecha operativa gana a una futura y a una antigua', () => {
    const cmp = byOperativeDateFirstThenFreshness('2026-10-25');
    const today = { rate_date: '2026-10-25', captured_at: '2026-10-25T01:18:00Z' };
    const future = { rate_date: '2026-10-26', captured_at: '2026-10-26T00:28:00Z' };
    const past = { rate_date: '2026-10-24', captured_at: '2026-10-24T23:00:00Z' };
    expect(cmp(today, future)).toBeLessThan(0);
    expect(cmp(today, past)).toBeLessThan(0);
    // Futura vs antigua: la futura (más reciente) va antes
    expect(cmp(future, past)).toBeLessThan(0);
  });

  it('misma fecha: gana la captura más reciente (captured_at DESC)', () => {
    const cmp = byOperativeDateFirstThenFreshness('2026-10-25');
    const a = { rate_date: '2026-10-25', captured_at: '2026-10-25T19:55:00Z' };
    const b = { rate_date: '2026-10-25', captured_at: '2026-10-25T23:28:51Z' };
    expect(cmp(a, b)).toBeGreaterThan(0); // b (más fresca) primero
    expect(cmp(b, a)).toBeLessThan(0);
  });

  it('captured_at ausente no rompe la comparación', () => {
    const cmp = byOperativeDateFirstThenFreshness('2026-10-25');
    const a = { rate_date: '2026-10-25' };
    const b = { rate_date: '2026-10-25', captured_at: '2026-10-25T23:00:00Z' };
    expect(() => [a, b].sort(cmp)).not.toThrow();
    expect(cmp(a, b)).toBeGreaterThan(0); // la que TIENE captured_at gana
  });
});
