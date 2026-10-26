/**
 * exchange-rates-get.test.ts — Pruebas del GET /api/exchange-rates tras
 * IC-DIVIZA-002 (misión §5) e IC-DIVIZA-003 (retiro de elToque como fuente
 * activa — 2026-10-26).
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
 *   - (10) El histórico elToque se devuelve INTACTO SOLO bajo consulta
 *     explícita (source=elToque) — sin re-atribución ni re-fechado.
 *
 * IC-DIVIZA-003 (criterios de aceptación §5):
 *   - (2) Diviza real + elToque antigua/virtual → gana Diviza; elToque NI
 *     SIQUIERA se devuelve en source=informal.
 *   - (4) La API no genera ni devuelve arrastres de elToque para el cálculo
 *     vigente: ninguna virtual, ningún conteo, ninguna entrada en
 *     carry_forward_dates — ni en la consulta por defecto ni en informal.
 *   - El archivo elToque (source=elToque) se sirve íntegro y SIN virtuales.
 *   - La consulta por defecto (sin source) NO incluye filas elToque.
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

  it('caso 6 (IC-DIVIZA-003): informal_latest resuelve la Diviza REAL y elToque NI aparece en la respuesta', async () => {
    // Escenario REAL de producción: Diviza real de hoy + histórico elToque
    // (fuente muerta 2026-07-28). Con source=informal la API consulta SOLO
    // Diviza (fuente activa) y excluye EXPRESAMENTE toda fila elToque.
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
    // IC-DIVIZA-003 §1: NINGUNA fila elToque en la respuesta (ni real ni
    // virtual): la fuente histórica no participa en la ruta de datos vigentes.
    const elToqueRows = (json.rates as Row[]).filter(r => r.source === 'elToque');
    expect(elToqueRows).toHaveLength(0);
    // Y por tanto ningún arrastre de elToque en el conteo ni en las fechas
    expect(json.carry_forward_count).toBe(0);
    expect((json.carry_forward_dates as any[]).some(d => d.source === 'elToque')).toBe(false);
  });

  it('las virtuales carry-forward de fuentes ACTIVAS CONSERVAN el captured_at original (no «ahora»)', async () => {
    // IC-DIVIZA-003: elToque jamás genera virtuales; se prueba el mecanismo
    // con una fuente ACTIVA (BCC de ayer sin fila hoy).
    const bccAyer = bccRow(YESTERDAY, 743);
    queryResult.data = [bccAyer, divizaRow(TODAY, 840)];

    const before = new Date().toISOString();
    const res = await GET(makeRequest());
    const after = new Date().toISOString();
    const json = await res.json();

    const virtual = (json.rates as Row[]).find(
      (r: Row) => r.capture_method === 'carry_forward' && r.source === 'BCC' && r.currency === 'USD',
    );
    expect(virtual).toBeDefined();
    // El captured_at de la virtual es el ORIGINAL (ayer), jamás un
    // timestamp entre before/after (que era el bug que desplazaba a Diviza).
    expect(virtual!.captured_at).toBe(`${YESTERDAY}T00:11:42Z`);
    expect(virtual!.captured_at < before).toBe(true);
    expect(after > virtual!.captured_at).toBe(true);
    // El arrastre reportado es SOLO de la fuente activa BCC
    expect(json.carry_forward_count).toBe(1);
    expect(json.carry_forward_dates[0]).toMatchObject({ source: 'BCC', currency: 'USD', original_date: YESTERDAY });
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

  it('caso 10 (IC-DIVIZA-003): el archivo elToque se sirve SOLO bajo source=elToque, INTACTO y SIN virtuales', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(TODAY, 840),
      elToqueRow('2026-07-28', 675),
      elToqueRow('2026-07-27', 675),
    ];

    // Consulta EXPLÍCITA del archivo: filas íntegras con procedencia y
    // fechas originales — sin re-fecharlas a la fecha operativa ni crear
    // virtuales de arrastre.
    const res = await GET(makeRequest('?days=90&segment=3&source=elToque'));
    const json = await res.json();

    const reales = (json.rates as Row[]).filter(r => r.source === 'elToque' && r.capture_method !== 'carry_forward');
    expect(reales).toHaveLength(2);
    // Fechas y procedencia originales conservadas
    expect(reales.map(r => r.rate_date).sort()).toEqual(['2026-07-27', '2026-07-28']);
    expect(reales.every(r => r.source === 'elToque')).toBe(true);
    // SIN virtuales de elToque (misión §2: el archivo jamás se arrastra)
    expect((json.rates as Row[]).filter(r => r.capture_method === 'carry_forward')).toHaveLength(0);
    expect(json.carry_forward_count).toBe(0);
    expect(json.sources_queried).toEqual(['elToque']);
  });

  it('IC-DIVIZA-003 criterio 4: la consulta por DEFECTO no devuelve ni arrastra filas elToque', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      divizaRow(TODAY, 840),
      elToqueRow('2026-07-28', 675),
    ];

    const res = await GET(makeRequest());
    const json = await res.json();

    // Defecto = BCC + Diviza (activas): elToque excluida EXPRESAMENTE de la
    // respuesta — defensa en profundidad aunque el mock no aplique el filtro
    // .in() del query (la BD real sí lo aplica; el route vuelve a filtrar).
    expect((json.rates as Row[]).some(r => r.source === 'elToque')).toBe(false);
    expect((json.rates as Row[]).some(r => r.source === 'Diviza')).toBe(true);
    expect(json.sources_queried).toEqual(['BCC', 'Diviza']);
    expect(json.carry_forward_count).toBe(0);
    expect((json.carry_forward_dates as any[]).some(d => d.source === 'elToque')).toBe(false);
  });

  it('IC-DIVIZA-003: solo elToque en BD → source=informal devuelve vacío honesto (archivo jamás vigente)', async () => {
    queryResult.data = [
      bccRow(TODAY, 743),
      elToqueRow('2026-07-28', 675),
    ];

    const res = await GET(makeRequest('?days=90&segment=3&source=informal&currency=USD'));
    const json = await res.json();

    // Sin Diviza no hay tasa informal vigente: ni informal_latest ni filas
    // (elToque NO la sustituye — «Sin dato fiable» en la vista).
    expect(json.informal_latest).toBeUndefined();
    expect((json.rates as Row[]).filter(r => r.source === 'elToque')).toHaveLength(0);
    expect((json.rates as Row[]).filter(r => r.source !== 'BCC')).toHaveLength(0);
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

describe('GET /api/exchange-rates — serie informal UNIFICADA del Histórico (IC-UX-HISTORY-004 §4)', () => {
  // Estado real de la BD al diseñar la misión: elToque 2025-12-25→2026-07-28
  // (archivo) + Diviza desde 2026-10-25 (activa) + BCC diario. El Histórico
  // consulta TODO ese rango como UNA serie con procedencia.
  const archivo = [
    elToqueRow('2025-12-25', 440),
    elToqueRow('2026-01-15', 450),
    elToqueRow('2026-07-28', 475),
  ];

  it('source=all consulta BCC + TODAS las informales (activas + históricas) y devuelve elToque con su procedencia', async () => {
    queryResult.data = [...archivo, bccRow(TODAY, 380), divizaRow(TODAY, 840)];

    const res = await GET(makeRequest('?days=all&source=all&segment=3'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sources_queried).toEqual(['BCC', 'Diviza', 'elToque']);
    // El archivo elToque VIAJA COMPLETO en la respuesta del Histórico…
    const elToqueRows = (json.rates as Row[]).filter(r => r.source === 'elToque');
    expect(elToqueRows).toHaveLength(3);
    expect(elToqueRows.map(r => r.rate_date)).toContain('2025-12-25');
    // …SIN re-atribuir: source sigue siendo 'elToque' (criterio 7).
    expect(elToqueRows.every(r => r.source === 'elToque')).toBe(true);
  });

  it('source=informal-all consulta TODAS las informales SIN BCC', async () => {
    queryResult.data = [...archivo, divizaRow(TODAY, 840)];

    const res = await GET(makeRequest('?days=all&source=informal-all&segment=3'));
    const json = await res.json();

    expect(json.sources_queried).toEqual(['Diviza', 'elToque']);
    expect((json.rates as Row[]).some(r => r.source === 'BCC')).toBe(false);
  });

  it('days=all NO aplica corte de fecha (todo el rango disponible, sin truncar)', async () => {
    queryResult.data = [...archivo, divizaRow(TODAY, 840)];

    await GET(makeRequest('?days=all&source=all&segment=3'));

    // La cadena NO recibió gte('rate_date', …): sin ventana de 7/30/90 días.
    // (chain.gte se usa SOLO con corte; aquí no debe llamarse.)
    expect(chain.gte).not.toHaveBeenCalled();
  });

  it('la consulta del archivo NO resuelve informal_latest (separación de responsabilidades: la vigente es de source=informal)', async () => {
    queryResult.data = [...archivo, divizaRow(TODAY, 840)];

    for (const source of ['all', 'informal-all']) {
      const res = await GET(makeRequest(`?days=all&source=${source}&segment=3&currency=USD`));
      const json = await res.json();
      // El archivo jamás alimenta la selección de la tasa VIGENTE.
      expect(json.informal_latest).toBeUndefined();
    }
  });

  it('las filas de elToque del archivo NO generan carry-forward ni conteo de arrastre', async () => {
    // El archivo termina 2026-07-28: una fuente muerta jamás se «arrastra».
    queryResult.data = [...archivo, bccRow(TODAY, 380), divizaRow(TODAY, 840)];

    const res = await GET(makeRequest('?days=all&source=all&segment=3'));
    const json = await res.json();

    const virtuales = (json.rates as Row[]).filter(r => r.capture_method === 'carry_forward');
    expect(virtuellesTodosDeFuentesActivas(virtuales)).toBe(true);
    expect((json.carry_forward_dates as any[]).some(d => d.source === 'elToque')).toBe(false);
  });

  it('expone oldest/newest_rate_date y informal_sources_included sobre filas reales (rango servido honesto)', async () => {
    queryResult.data = [...archivo, bccRow('2026-03-26', 360), bccRow(TODAY, 380), divizaRow(TODAY, 840)];

    const res = await GET(makeRequest('?days=all&source=all&segment=3'));
    const json = await res.json();

    expect(json.oldest_rate_date).toBe('2025-12-25');
    expect(json.newest_rate_date).toBe(TODAY);
    expect(json.informal_sources_included).toEqual(['Diviza', 'elToque']);
  });

  it('error de Supabase → 500 con el mensaje (nunca un histórico parcial como completo)', async () => {
    queryResult = { data: null, error: { message: 'connection reset' } };

    const res = await GET(makeRequest('?days=all&source=all&segment=3'));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('connection reset');
    expect(json.rates).toBeUndefined();
  });
});

/** Toda virtual carry-forward debe ser de una fuente ACTIVA (BCC/Diviza). */
function virtuellesTodosDeFuentesActivas(virtuales: Row[]): boolean {
  return virtuales.every(r => r.source === 'BCC' || r.source === 'Diviza');
}
