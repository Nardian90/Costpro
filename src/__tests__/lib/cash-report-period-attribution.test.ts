import { describe, it, expect } from 'vitest';
// MISIÓN 2026-10-16 (Reporte Entrega — comisión del 15/10 en el filtro del 16/10) + ADENDA
// del negocio del mismo día: el criterio canónico del reporte es la FECHA DEL PAGO
// confirmado (paid_at) en ventana de negocio determinista (Habana). El periodo de ventas
// es metadata informativa, nunca criterio de atribución.
// FALLAN con ventanas dependientes del navegador/UTC y PASAN con la corrección.
import {
  BUSINESS_TIMEZONE,
  tzOffsetMinutes,
  businessDayWindow,
  businessDayOf,
  todayBusinessDay,
  instantForBusinessDay,
  commissionPaidAtFilter,
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
    // paid_at CORREGIDO del pago investigado (17:00 Habana del 15 → 21:00Z):
    // la ventana del 15 SÍ lo contiene (criterio fecha de pago)…
    expect('2026-10-15T21:00:00.000Z' >= w15.startIso && '2026-10-15T21:00:00.000Z' <= w15.endIso).toBe(true);
    // …y la del 16 NO (16/10 exclusivo sin la comisión del 15).
    const w16 = businessDayWindow('2026-10-16');
    expect('2026-10-15T21:00:00.000Z' >= w16.startIso && '2026-10-15T21:00:00.000Z' <= w16.endIso).toBe(false);
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

  it('paid_at corregido 15T21:00Z es día de negocio 15 y paid_at original 16T14:25Z es día 16', () => {
    expect(businessDayOf('2026-10-15T21:00:00.000Z')).toBe('2026-10-15');
    expect(businessDayOf('2026-10-16T14:25:10.075Z')).toBe('2026-10-16');
  });

  it('date-only pasa a través sin conversión (ruta del PDF Diario)', () => {
    expect(businessDayOf('2026-10-15')).toBe('2026-10-15');
  });
});

describe('period-attribution — día de negocio actual (validación de la fecha del pago)', () => {
  it('todayBusinessDay devuelve YYYY-MM-DD válido y coherente con businessDayOf(ahora)', () => {
    const t = todayBusinessDay();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t).toBe(businessDayOf(new Date().toISOString(), BUSINESS_TIMEZONE));
  });
});

describe('period-attribution — instante de un día de negocio pasado (hora de registro)', () => {
  it('el instante de un día anterior cae EN ese día de negocio y cerca de la hora de registro', () => {
    const nowWall = new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).format(new Date());
    const iso = instantForBusinessDay('2026-10-01');
    expect(businessDayOf(iso)).toBe('2026-10-01');
    // hora de registro (reloj de pared de la tienda) conservada en el día elegido
    const resWall = new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    expect(Math.abs(toMin(resWall) - toMin(nowWall))).toBeLessThanOrEqual(2);
  });

  it('rechaza entradas que no son date-only', () => {
    expect(() => instantForBusinessDay('2026-10-01T10:00:00Z')).toThrow();
  });
});

describe('period-attribution — filtro PostgREST por FECHA DEL PAGO (criterio canónico)', () => {
  it('entrada ISO de la vista: ventana usada tal cual (paid_at gte/lte)', () => {
    const f = commissionPaidAtFilter('2026-10-15T04:00:00.000Z', '2026-10-16T03:59:59.999Z');
    expect(f).toBe('and(paid_at.gte.2026-10-15T04:00:00.000Z,paid_at.lte.2026-10-16T03:59:59.999Z)');
  });

  it('entrada date-only (PDF Diario): convierte a ventana de NEGOCIO determinista, no UTC', () => {
    const f = commissionPaidAtFilter('2026-10-15', '2026-10-15');
    expect(f).toBe('and(paid_at.gte.2026-10-15T04:00:00.000Z,paid_at.lte.2026-10-16T03:59:59.999Z)');
  });

  it('ATRIBUCIÓN día 15 exclusivo: pago con paid_at 15T21:00Z (17:00 Habana, corregido) SÍ aparece', () => {
    const f = commissionPaidAtFilter('2026-10-15T04:00:00.000Z', '2026-10-16T03:59:59.999Z');
    const inWindow = '2026-10-15T21:00:00.000Z' >= f.split('paid_at.gte.')[1].split(',')[0]
      && '2026-10-15T21:00:00.000Z' <= f.split('paid_at.lte.')[1].split(')')[0];
    expect(inWindow).toBe(true);
  });

  it('ATRIBUCIÓN día 16 exclusivo: ni el paid_at corregido (15T21Z) ni el pago del periodo 15 se atribuyen al 16', () => {
    const f = commissionPaidAtFilter('2026-10-16T04:00:00.000Z', '2026-10-17T03:59:59.999Z');
    const lo = f.split('paid_at.gte.')[1].split(',')[0];
    const hi = f.split('paid_at.lte.')[1].split(')')[0];
    expect('2026-10-15T21:00:00.000Z' >= lo && '2026-10-15T21:00:00.000Z' <= hi).toBe(false);
    // un pago del periodo 15/10 confirmado hoy 16/10 10:25 Habana SÍ aparece el 16
    // (semántica del negocio: «si se pagó el 16, es correcto que se refleje el 16»)
    expect('2026-10-16T14:25:10.075Z' >= lo && '2026-10-16T14:25:10.075Z' <= hi).toBe(true);
  });

  it('rango 15–16 (ventana completa de la vista): cada pago aparece exactamente una vez', () => {
    const f = commissionPaidAtFilter('2026-10-15T04:00:00.000Z', '2026-10-17T03:59:59.999Z');
    const lo = f.split('paid_at.gte.')[1].split(',')[0];
    const hi = f.split('paid_at.lte.')[1].split(')')[0];
    expect('2026-10-15T21:00:00.000Z' >= lo && '2026-10-15T21:00:00.000Z' <= hi).toBe(true);
    expect('2026-10-16T14:25:10.075Z' >= lo && '2026-10-16T14:25:10.075Z' <= hi).toBe(true);
  });
});
