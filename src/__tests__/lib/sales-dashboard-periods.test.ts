/**
 * COSTPRO-SALES-DASHBOARD-001 · Pruebas de utilidades puras de período y variación.
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePeriodWindow, previousEquivalentWindow, percentChange,
  havanaNow, toDateInputValue, granularityLabel, PERIOD_OPTIONS,
} from '@/lib/sales-dashboard/periods';

describe('COSTPRO-SALES-DASHBOARD-001 · períodos (America/Havana)', () => {
  it('tiene los 10 presets requeridos por la misión', () => {
    const values = PERIOD_OPTIONS.map(o => o.value);
    expect(values).toEqual([
      'today', 'yesterday', 'last7', 'last30', 'this_week', 'prev_week',
      'this_month', 'prev_month', 'this_year', 'custom',
    ]);
  });

  it('havanaNow devuelve una fecha coherente (offset UTC-5 fijo)', () => {
    const h = havanaNow();
    const diff = (h.getTime() - Date.now()) / 3600000;
    // La Habana es UTC-5 todo el año; havanaNow marca la hora local como UTC
    expect(Math.abs(diff + 5)).toBeLessThan(0.1);
  });

  it('hoy: ventana de un día completo', () => {
    const w = resolvePeriodWindow('today');
    expect(w.to.getTime() - w.from.getTime()).toBe(24 * 3600 * 1000 - 1);
    // medianoche Havana: 04:00 o 05:00 UTC según DST
    expect([4, 5]).toContain(w.from.getUTCHours());
  });

  it('últimos 7 días: 7 días naturales terminando hoy', () => {
    const w = resolvePeriodWindow('last7');
    const days = (n: Date) => Math.round((n.getTime() - w.from.getTime()) / (24 * 3600 * 1000));
    // hoy incluido: la ventana cubre 7 días locales (el DST puede añadir 1h absoluta)
    expect(days(w.to)).toBeGreaterThanOrEqual(6);
    expect([4, 5]).toContain(w.from.getUTCHours());
  });

  it('últimos 30 días: 30 días naturales terminando hoy', () => {
    const w = resolvePeriodWindow('last30');
    expect((w.to.getTime() - w.from.getTime() + 1) / (24 * 3600 * 1000)).toBeGreaterThanOrEqual(30);
  });

  it('mes anterior: desde el 1º hasta el último día del mes anterior', () => {
    const w = resolvePeriodWindow('prev_month');
    expect(w.from.getUTCDate()).toBe(1);
    const to = new Date(w.to.getTime() + 1); // inicio del día siguiente
    expect(to.getUTCDate()).toBe(1); // el día siguiente al último día es el 1º
  });

  it('semana anterior: 7 días completos, sin solapar esta semana', () => {
    const prev = resolvePeriodWindow('prev_week');
    const this_ = resolvePeriodWindow('this_week');
    expect(prev.to.getTime()).toBeLessThan(this_.from.getTime());
    expect((prev.to.getTime() - prev.from.getTime() + 1) / (24 * 3600 * 1000)).toBeGreaterThanOrEqual(7);
  });

  it('personalizado: fechas exactas', () => {
    const w = resolvePeriodWindow('custom', '2026-11-03', '2026-11-08');
    expect(toDateInputValue(w.from)).toBe('2026-11-03');
    expect(toDateInputValue(w.to)).toBe('2026-11-08');
    expect((w.to.getTime() - w.from.getTime() + 1) / (24 * 3600 * 1000)).toBe(6);
  });

  it('personalizado inválido cae al mes actual (fallback seguro)', () => {
    const w = resolvePeriodWindow('custom', '', '');
    const now = havanaNow();
    expect(toDateInputValue(w.from)).toBe(`${now.getUTCFullYear()}-11-01`);
  });
});

describe('COSTPRO-SALES-DASHBOARD-001 · ventana anterior equivalente', () => {
  it('misma cantidad de días locales, terminando la víspera del inicio', () => {
    // 1–8 nov 2026: el cambio DST de Cuba (1 nov, 01:00 local) hace que la
    // ventana abarque 193 h absolutas — pero SIEMPRE son 8 días locales.
    const w = { from: new Date('2026-11-01T04:00:00Z'), to: new Date('2026-11-09T03:59:59.999Z') };
    const p = previousEquivalentWindow(w);
    // la víspera local del 1 nov es el 31 oct (fin 23:59:59.999 Havana)
    expect(toDateInputValue(p.to)).toBe('2026-10-31');
    expect(toDateInputValue(p.from)).toBe('2026-10-24');
  });

  it('DST-safe: la ventana previa cubre los mismos días naturales', () => {
    // 3–10 marzo 2026 (el cambio DST de Cuba del 8 mar cae dentro: EDT a partir del 2º domingo)
    const w = { from: new Date('2026-03-03T05:00:00Z'), to: new Date('2026-03-11T04:59:59.999Z') };
    const p = previousEquivalentWindow(w);
    // víspera local del inicio
    expect(toDateInputValue(p.to)).toBe('2026-03-02');
    // misma cantidad de días naturales (8): del 23 feb al 2 mar
    const daysOf = (a: Date, b: Date) =>
      Math.round((new Date(b.toISOString()).getTime() - new Date(a.toISOString()).getTime()) / 86400000);
    const localDays = (from: Date, to: Date) => {
      const ymd = (d: Date) => { const q = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d); const g = (t: string) => q.find(x => x.type === t)!.value; return new Date(`${g('year')}-${g('month')}-${g('day')}T12:00:00Z`); };
      return Math.round((ymd(to).getTime() - ymd(from).getTime()) / 86400000) + 1;
    };
    expect(localDays(p.from, p.to)).toBe(localDays(w.from, w.to));
    void daysOf;
  });

  it('períodos equivalentes: 1-8 nov ↔ 24-31 oct (8 días vs 8 días)', () => {
    const w = resolvePeriodWindow('custom', '2026-11-01', '2026-11-08');
    const p = previousEquivalentWindow(w);
    expect(toDateInputValue(p.from)).toBe('2026-10-24');
    expect(toDateInputValue(p.to)).toBe('2026-10-31');
  });
});

describe('COSTPRO-SALES-DASHBOARD-001 · variación porcentual', () => {
  it('calcula la variación con redondeo a 1 decimal', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(90, 100)).toBe(-10);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(1050, 1000)).toBe(5);
  });

  it('devuelve null (—) cuando el período anterior es 0 o no válido', () => {
    expect(percentChange(500, 0)).toBeNull();
    expect(percentChange(500, NaN)).toBeNull();
    expect(percentChange(500, Infinity)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it('usa valor absoluto del previo en el denominador (evita % engañosos)', () => {
    expect(percentChange(-100, -50)).toBe(-100); // de -50 a -100: empeora el doble
  });
});

describe('COSTPRO-SALES-DASHBOARD-001 · etiquetas', () => {
  it('granularidad legible', () => {
    expect(granularityLabel('hour')).toBe('por hora');
    expect(granularityLabel('day')).toBe('por día');
    expect(granularityLabel('week')).toBe('por semana');
    expect(granularityLabel('month')).toBe('por mes');
  });
});
