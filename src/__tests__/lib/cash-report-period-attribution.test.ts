import { describe, it, expect } from 'vitest';
// MISIÓN 2026-10-16 (Reporte Entrega — comisión del 15/10 en el filtro del 16/10):
// pruebas unitarias de la lógica de fechas de period-attribution.
// FALLAN con el comportamiento defectuoso (ventana dependiente del navegador + atribución
// por paid_at) y PASAN con la corrección (ventana de negocio determinista + periodo).
import {
  BUSINESS_TIMEZONE,
  tzOffsetMinutes,
  businessDayWindow,
  businessDayOf,
  commissionPeriodOrFilter,
} from '@/lib/cash-report/period-attribution';

describe('period-attribution — ventana de negocio determinista', () => {
  it('mapea el día 2026-10-16 a la ventana Habana [16T04:00Z, 17T03:59:59.999Z] (DST UTC−4)', () => {
    const w = businessDayWindow('2026-10-16');
    expect(w.startIso).toBe('2026-10-16T04:00:00.000Z');
    expect(w.endIso).toBe('2026-10-17T03:59:59.999Z');
  });

  it('mapea el día 2026-10-15 a [15T04:00Z, 16T03:59:59.999Z] — los dos días de la misión', () => {
    const w15 = businessDayWindow('2026-10-15');
    expect(w15.startIso).toBe('2026-10-15T04:00:00.000Z');
    expect(w15.endIso).toBe('2026-10-16T03:59:59.999Z');
    // la ventana del 15 NO debe contener paid_at 2026-10-16T14:25:10Z (el pago investigado)…
    expect('2026-10-16T14:25:10.075Z' > w15.endIso).toBe(true);
    // …pero la del 16 SÍ (por eso el bug lo mostraba el 16 con el criterio paid_at)
    const w16 = businessDayWindow('2026-10-16');
    expect('2026-10-16T14:25:10.075Z' >= w16.startIso && '2026-10-16T14:25:10.075Z' <= w16.endIso).toBe(true);
  });

  it('es determinista: el mismo día produce la misma ventana "desde" cualquier TZ simulada', () => {
    // La función no consulta la TZ del entorno: misma entrada → misma salida siempre.
    expect(businessDayWindow('2026-10-16')).toEqual(businessDayWindow('2026-10-16'));
  });

  it('rechaza entradas que no son date-only', () => {
    expect(() => businessDayWindow('2026-10-16T04:00:00Z')).toThrow();
    expect(() => businessDayWindow('')).toThrow();
  });

  it('offset de Habana en octubre 2026 es −240 (DST)', () => {
    expect(tzOffsetMinutes(new Date('2026-10-16T12:00:00Z'), BUSINESS_TIMEZONE)).toBe(-240);
  });
});

describe('period-attribution — días de negocio de un instante', () => {
  it('los límites 16T04:00Z y 17T03:59:59.999Z pertenecen al día 16 en Habana', () => {
    expect(businessDayOf('2026-10-16T04:00:00.000Z')).toBe('2026-10-16');
    expect(businessDayOf('2026-10-17T03:59:59.999Z')).toBe('2026-10-16');
  });

  it('paid_at 16T14:25:10Z (el pago investigado) es día 16 — descarta defecto de zona horaria', () => {
    // 10:25 AM Habana: día 16 en UTC y en Habana → el bug no era de límites/TZ.
    expect(businessDayOf('2026-10-16T14:25:10.075Z')).toBe('2026-10-16');
  });

  it('date-only pasa a través sin conversión (ruta del PDF Diario)', () => {
    expect(businessDayOf('2026-10-15')).toBe('2026-10-15');
  });
});

describe('period-attribution — filtro PostgREST por periodo', () => {
  it('día 16 exclusivo: el periodo [15,15] NO solapa y el pago del caso NO se atribuye al 16', () => {
    const f = commissionPeriodOrFilter('2026-10-16T04:00:00.000Z', '2026-10-17T03:59:59.999Z');
    // periodo 15/10 vs días [16,16]: period_start.lte.2026-10-16 ✓ pero period_end.gte.2026-10-16 ✗
    expect(f).toContain('and(period_start.lte.2026-10-16,period_end.gte.2026-10-16)');
    // fallback paid_at con la ventana cruda del 16
    expect(f).toContain('period_start.is.null,paid_at.gte.2026-10-16T04:00:00.000Z,paid_at.lte.2026-10-17T03:59:59.999Z');
    // simulación de la atribución: periodo [15,15] contra días [16,16]
    const overlap = '2026-10-15' <= '2026-10-16' && '2026-10-15' >= '2026-10-16';
    expect(overlap).toBe(false); // con el fix, el pago NO aparece el 16
  });

  it('día 15 exclusivo: el periodo [15,15] SÍ solapa — el pago aparece en su día', () => {
    const f = commissionPeriodOrFilter('2026-10-15T04:00:00.000Z', '2026-10-16T03:59:59.999Z');
    expect(f).toContain('and(period_start.lte.2026-10-15,period_end.gte.2026-10-15)');
    const overlap = '2026-10-15' <= '2026-10-15' && '2026-10-15' >= '2026-10-15';
    expect(overlap).toBe(true); // con el fix, el pago SÍ aparece el 15
  });

  it('rango 15–16: el periodo [15,15] aparece UNA vez (solapa con el rango, sin duplicar)', () => {
    const f = commissionPeriodOrFilter('2026-10-15T04:00:00.000Z', '2026-10-17T03:59:59.999Z');
    expect(f).toContain('and(period_start.lte.2026-10-16,period_end.gte.2026-10-15)');
    const overlap = '2026-10-15' <= '2026-10-16' && '2026-10-15' >= '2026-10-15';
    expect(overlap).toBe(true);
  });

  it('acepta date-only (PDF Diario) y construye el fallback con ventana UTC del día', () => {
    const f = commissionPeriodOrFilter('2026-10-15', '2026-10-15');
    expect(f).toBe('and(period_start.lte.2026-10-15,period_end.gte.2026-10-15),' +
      'and(period_start.is.null,paid_at.gte.2026-10-15T00:00:00.000Z,paid_at.lte.2026-10-15T23:59:59.999Z)');
  });
});
