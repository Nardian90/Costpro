/**
 * CP-FIN · Misión integral 2026-11-22 (§5-§6) — pruebas del indicador de
 * ritmo de ventas: períodos equivalentes del mes anterior, métricas puras
 * (índice/variación/diferencia), casos especiales (sin base, base negativa,
 * meses de distinta longitud) y alineación de las evoluciones acumuladas.
 * Los importes provienen siempre del RPC get_sales_dashboard_analytics:
 * aquí se validan SOLO las derivaciones cliente (misión §6.4: los resultados
 * deben coincidir con un cálculo independiente de referencia).
 */
import { describe, it, expect } from 'vitest';
import {
  previousMonthEquivalentWindow, percentChange, resolvePeriodWindow, toDateInputValue,
} from '@/lib/sales-dashboard/periods';
import {
  computeRhythmMetrics, buildEvolutionChartData, buildCumulativeSeries, bulletScale,
  type RhythmTotals,
} from '@/lib/sales-dashboard/rhythm';
import type { DashboardSeriesPoint } from '@/lib/sales-dashboard/schema';

// ── Helpers de referencia independiente ─────────────────────────────────────

/** Medianoche Havana marcada como UTC-5 (invierno) / UTC-4 (verano). */
function havanaMid(y: number, m: number, d: number): Date {
  for (const off of [4, 5]) {
    const c = new Date(Date.UTC(y, m - 1, d, off, 0, 0));
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(c);
    const g = (t: string) => parts.find(p => p.type === t)?.value;
    if (g('year') === String(y) && g('month') === String(m).padStart(2, '0')
        && g('day') === String(d).padStart(2, '0') && g('hour') === '00' && g('minute') === '00') {
      return c;
    }
  }
  throw new Error(`sin medianoche Havana para ${y}-${m}-${d}`);
}

const dayDiff = (a: Date, b: Date): number =>
  Math.round((havanaMidOf(a).getTime() - havanaMidOf(b).getTime()) / (24 * 3600 * 1000));

function havanaMidOf(d: Date): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return havanaMid(g('year'), g('month'), g('day'));
}

const totals = (net: number, devoCup = 0, ops = 1, devoUsd = 0): RhythmTotals =>
  ({ netCup: net, devolutionsCup: devoCup, devolutionsUsd: devoUsd, ops });

// ── Período comparable (misión §5.3) ────────────────────────────────────────

describe('previousMonthEquivalentWindow — comparación de períodos equivalentes', () => {
  it('mes en curso 1–22 nov ↔ 1–22 oct (NO octubre completo)', () => {
    const w = { from: havanaMid(2026, 11, 1), to: new Date(havanaMid(2026, 11, 22).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-10-01');
    expect(toDateInputValue(prev.to)).toBe('2026-10-22');
    // Igual duración (mismo número de días locales).
    expect(dayDiff(w.to, w.from)).toBe(dayDiff(prev.to, prev.from));
  });

  it('mes cerrado completo ↔ mes anterior completo', () => {
    const w = { from: havanaMid(2026, 10, 1), to: new Date(havanaMid(2026, 10, 31).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-09-01');
    expect(toDateInputValue(prev.to)).toBe('2026-09-30');
  });

  it('días inexistentes se ajustan al último día del mes anterior (31 mar → 28 feb)', () => {
    const w = { from: havanaMid(2026, 3, 1), to: new Date(havanaMid(2026, 3, 31).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-02-01');
    expect(toDateInputValue(prev.to)).toBe('2026-02-28');
  });

  it('30 mar → 28 feb (2026 no es bisiesto)', () => {
    const w = { from: havanaMid(2026, 3, 10), to: new Date(havanaMid(2026, 3, 30).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-02-10');
    expect(toDateInputValue(prev.to)).toBe('2026-02-28');
  });

  it('cruce de año: 1–15 ene ↔ 16–31 dic del año anterior', () => {
    const w = { from: havanaMid(2027, 1, 1), to: new Date(havanaMid(2027, 1, 15).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-12-01');
    expect(toDateInputValue(prev.to)).toBe('2026-12-15');
  });

  it('rango personalizado conserva días de inicio y fin en el mes anterior', () => {
    const w = { from: havanaMid(2026, 11, 8), to: new Date(havanaMid(2026, 11, 12).getTime() + 24 * 3600 * 1000 - 1) };
    const prev = previousMonthEquivalentWindow(w);
    expect(toDateInputValue(prev.from)).toBe('2026-10-08');
    expect(toDateInputValue(prev.to)).toBe('2026-10-12');
  });

  it('presets this_month / prev_month producen el comparable esperado', () => {
    const thisMonth = resolvePeriodWindow('this_month');
    const prev = previousMonthEquivalentWindow(thisMonth);
    const { from, to } = prev;
    expect(to.getUTCHours()).toBeLessThanOrEqual(23);
    const fromDay = Number(toDateInputValue(from).slice(8));
    const toDay = Number(toDateInputValue(to).slice(8));
    expect(toDay - fromDay).toBe(dayDiff(thisMonth.to, thisMonth.from));
  });
});

// ── Fórmulas del indicador (misión §5.2/§6.4) ───────────────────────────────

describe('computeRhythmMetrics — índice, variación y diferencia', () => {
  it('ventas actuales IGUALES al período anterior → índice 100%, variación 0', () => {
    const m = computeRhythmMetrics(totals(1000000), totals(1000000));
    expect(m.ventasNetas).toBe(1000000);
    expect(m.indexPct).toBe(100);
    expect(m.variationPct).toBe(0);
    expect(m.diffCup).toBe(0);
    expect(m.direction).toBe('flat');
    expect(m.baseState).toBe('ok');
  });

  it('ventas SUPERIORES (+8%, ejemplo de la misión) → índice 108%, +80,000 CUP', () => {
    const m = computeRhythmMetrics(totals(1080000), totals(1000000));
    expect(m.indexPct).toBe(108);
    expect(m.variationPct).toBe(8);
    expect(m.diffCup).toBe(80000);
    expect(m.direction).toBe('up');
  });

  it('ventas INFERIORES → índice < 100 y variación negativa', () => {
    const m = computeRhythmMetrics(totals(900000), totals(1000000));
    expect(m.indexPct).toBe(90);
    expect(m.variationPct).toBe(-10);
    expect(m.diffCup).toBe(-100000);
    expect(m.direction).toBe('down');
  });

  it('período anterior SIN ventas → Sin base comparable (sin dividir por cero)', () => {
    const m = computeRhythmMetrics(totals(250000), totals(0, 0, 0));
    expect(m.baseState).toBe('no-base');
    expect(m.indexPct).toBeNull();
    expect(m.variationPct).toBeNull();
    expect(m.ventasNetas).toBe(250000); // el importe actual sigue visible
    expect(Number.isFinite(m.diffCup)).toBe(true);
  });

  it('período anterior NEGATIVO (devoluciones > ventas) → sin porcentaje fiable', () => {
    const m = computeRhythmMetrics(totals(300000), totals(1000, 5000));
    expect(m.baseState).toBe('negative-base');
    expect(m.indexPct).toBeNull();
    expect(m.variationPct).toBeNull();
    expect(m.prevVentasNetas).toBe(-4000);
    expect(m.diffCup).toBe(304000);
  });

  it('DEVOLUCIONES reducen las ventas netas conforme al tratamiento contable', () => {
    // docs 100,000 − devoluciones 8,000 = netas 92,000; anterior docs 100,000 − 0
    const m = computeRhythmMetrics(totals(100000, 8000), totals(100000));
    expect(m.ventasNetas).toBe(92000);
    expect(m.ventasDocumentos).toBe(100000);
    expect(m.indexPct).toBe(92);
    expect(m.variationPct).toBe(-8);
  });

  it('devoluciones en USD NO se convierten ni suman al CUP (misión §6.2)', () => {
    const m = computeRhythmMetrics(totals(100000, 0, 1, 500), totals(100000));
    expect(m.ventasNetas).toBe(100000); // las 500 USD no alteran el CUP
    expect(m.devolucionesCup).toBe(0);
  });

  it('redondeo a 1 decimal del índice (independiente de referencia)', () => {
    const m = computeRhythmMetrics(totals(1000), totals(333));
    // 1000/333×100 = 300.3003… → 300.3
    expect(m.indexPct).toBe(300.3);
  });

  it('percentChange mantiene su contrato: null sin base', () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(110, -100)).toBe(210); // |base| en denominador
  });
});

// ── Evolución acumulada alineada por posición ───────────────────────────────

describe('buildEvolutionChartData — evolución acumulada de ambos períodos', () => {
  const pt = (bucket: string, net: number): DashboardSeriesPoint =>
    ({ bucket, ops: 1, gross_cup: net, net_cup: net, discounts_cup: 0 } as DashboardSeriesPoint);

  it('acumula por día y comparte escala (label = día del mes)', () => {
    const cur = buildCumulativeSeries([pt('2026-11-01 00:00', 100), pt('2026-11-02 00:00', 150)]);
    expect(cur.map(c => c.label)).toEqual(['1', '2']);
    expect(cur[1].cumulative).toBe(250);
  });

  it('meses de distinta longitud: días inexistentes quedan en null (sin conectar)', () => {
    // Actual: marzo (31 días); anterior: febrero (28 días).
    const curPts = Array.from({ length: 3 }, (_, i) => pt(`2026-03-0${i + 1} 00:00`, 100));
    const prevPts = Array.from({ length: 2 }, (_, i) => pt(`2026-02-0${i + 1} 00:00`, 120));
    const data = buildEvolutionChartData(curPts, prevPts);
    expect(data.length).toBe(3);
    expect(data[0]).toEqual({ label: '1', cur: 100, prev: 120 });
    expect(data[2]).toEqual({ label: '3', cur: 300, prev: null });
  });

  it('buckets desordenados se ordenan por defensa antes de acumular', () => {
    const cur = buildCumulativeSeries([pt('2026-11-03 00:00', 50), pt('2026-11-01 00:00', 100), pt('2026-11-02 00:00', 25)]);
    expect(cur.map(c => c.cumulative)).toEqual([100, 125, 175]);
  });
});

// ── Escala del bullet chart ─────────────────────────────────────────────────

describe('bulletScale — sin recortes para índices > 100%', () => {
  it('índice dentro de 150% → cap 150, marca al 66.7% del track', () => {
    const s = bulletScale(108);
    expect(s.cap).toBe(150);
    expect(s.markerPct).toBeCloseTo(66.67, 1);
    expect(s.overflows).toBe(false);
  });

  it('índice 175% → cap crece a 175 (múltiplos de 25) y no recorta', () => {
    const s = bulletScale(175);
    expect(s.cap).toBe(175);
    expect(s.overflows).toBe(false);
  });

  it('índice fuera de escala (> cap máximo 400) se señala como overflow', () => {
    const s = bulletScale(520);
    expect(s.cap).toBe(400);
    expect(s.overflows).toBe(true);
  });

  it('sin índice (sin base comparable) usa la escala por defecto', () => {
    const s = bulletScale(null);
    expect(s.cap).toBe(150);
    expect(s.markerPct).toBeCloseTo(66.67, 1);
  });
});
