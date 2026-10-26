/**
 * operative-date.test.ts — Fecha operativa de negocio (America/Havana).
 *
 * MISIÓN IC-DIVIZA-002 §3 + caso de aceptación 5: la fecha que fecha las
 * capturas y determina la vigencia diaria es la CIVIL de Cuba. Se prueban
 * los instantes EXACTOS alrededor del cambio de día civil cubano respecto
 * a UTC (entre las 20:00 y la 01:00/02:00 de Cuba, UTC ya cambió de día):
 *
 *   - ANTES del cambio civil (UTC ya es «mañana», Cuba todavía «hoy»):
 *       2026-10-26T00:30:00Z = 25 oct 20:30 (CDT) → '2026-10-25'
 *   - DESPUÉS del cambio civil (UTC y Cuba en el mismo día):
 *       2026-10-26T05:30:00Z = 26 oct 01:30 (CDT) → '2026-10-26'
 *   - Invierno (EST, UTC-5): el cambio civil ocurre a las 05:00/06:00 UTC.
 *   - Límites DST de Cuba: 2º domingo de marzo y 1º de noviembre.
 *
 * La aritmética de días se prueba como calendario puro (sin zona).
 */
import { describe, it, expect } from 'vitest';
import {
  getOperativeDate,
  addDaysToDateString,
  buildOperativeDateRange,
  BUSINESS_TIMEZONE,
} from '@/lib/operative-date';

describe('getOperativeDate — fecha civil de Cuba (America/Havana)', () => {
  it('la zona de negocio es America/Havana', () => {
    expect(BUSINESS_TIMEZONE).toBe('America/Havana');
  });

  it('caso 5a: ANTES del cambio de día civil cubano — UTC ya cambió, Cuba no (verano CDT)', () => {
    // 2026-10-26 00:30 UTC = 25 de octubre, 20:30 en Cuba (CDT, UTC-4).
    // El código anterior (toISOString) fechaba '2026-10-26' — la captura de
    // las 20:30 de Cuba del día 25 se fechaba «mañana».
    expect(getOperativeDate(new Date('2026-10-26T00:30:00Z'))).toBe('2026-10-25');
  });

  it('caso 5b: DESPUÉS del cambio de día civil cubano (01:30 Cuba)', () => {
    // 2026-10-26 05:30 UTC = 26 de octubre, 01:30 en Cuba (CDT).
    expect(getOperativeDate(new Date('2026-10-26T05:30:00Z'))).toBe('2026-10-26');
  });

  it('caso 5c: instante exacto del cambio civil cubano en verano (00:00 Cuba = 04:00 UTC)', () => {
    // 03:59:59 UTC → Cuba sigue el 25; 04:00:00 UTC → Cuba empieza el 26.
    expect(getOperativeDate(new Date('2026-10-26T03:59:59Z'))).toBe('2026-10-25');
    expect(getOperativeDate(new Date('2026-10-26T04:00:00Z'))).toBe('2026-10-26');
  });

  it('caso 5d: en invierno (EST, UTC-5) el cambio civil es a las 05:00 UTC', () => {
    // 15 de enero 2027: Cuba en EST (UTC-5). 04:59:59 UTC → 23:59:59 del 14.
    expect(getOperativeDate(new Date('2027-01-15T04:59:59Z'))).toBe('2027-01-14');
    expect(getOperativeDate(new Date('2027-01-15T05:00:00Z'))).toBe('2027-01-15');
  });

  it('límite DST de Cuba: el 1º de noviembre 2026 Cuba vuelve a EST', () => {
    // 2026-11-01: DST termina (01:00 local → 00:00 EST). A las 06:30 UTC es
    // 01:30 EST del 1 de noviembre.
    expect(getOperativeDate(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    // La madrugada previa (05:30 UTC = 01:30 CDT del 1 de noviembre, antes
    // del cambio) sigue siendo 1 de noviembre en Cuba.
    expect(getOperativeDate(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    // Y el 31 de octubre por la noche (Cuba CDT aún, UTC-4):
    expect(getOperativeDate(new Date('2026-11-01T01:30:00Z'))).toBe('2026-10-31');
  });

  it('mediodía cubano: UTC y Cuba comparten fecha civil (caso trivial)', () => {
    // 17:00 UTC del 25 = 13:00 Cuba del 25.
    expect(getOperativeDate(new Date('2026-10-25T17:00:00Z'))).toBe('2026-10-25');
  });

  it('acepta epoch numérico además de Date', () => {
    expect(getOperativeDate(Date.parse('2026-10-26T00:30:00Z'))).toBe('2026-10-25');
  });
});

describe('addDaysToDateString — aritmética de calendario pura', () => {
  it('suma y resta días sin deriva de zona', () => {
    expect(addDaysToDateString('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDaysToDateString('2026-10-25', -1)).toBe('2026-10-24');
    expect(addDaysToDateString('2026-10-25', -6)).toBe('2026-10-19');
  });

  it('cruza meses y años correctamente (calendario, no 30 días fijos)', () => {
    expect(addDaysToDateString('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2027-03-01', -1)).toBe('2027-02-28'); // 2027 no bisiesto
    expect(addDaysToDateString('2028-03-01', -1)).toBe('2028-02-29'); // 2028 bisiesto
  });

  it('rechaza fechas malformadas (fail-closed, no inventa calendario)', () => {
    expect(() => addDaysToDateString('2026-10', 1)).toThrow();
    expect(() => addDaysToDateString('no-fecha', 1)).toThrow();
    expect(() => addDaysToDateString('', 1)).toThrow();
  });
});

describe('buildOperativeDateRange — intervalo operativo de captura', () => {
  it('termina SIEMPRE en la fecha operativa vigente (civil de Cuba)', () => {
    // 2026-10-26 00:30 UTC → Cuba sigue el 25: el rango de 7 días termina
    // el 25 (con toISOString terminaría el 26 y Diviza se fecharía «mañana»).
    const range = buildOperativeDateRange(7, new Date('2026-10-26T00:30:00Z'));
    expect(range).toHaveLength(7);
    expect(range[range.length - 1]).toBe('2026-10-25');
    expect(range[0]).toBe('2026-10-19');
  });

  it('días consecutivos ascendentes sin huecos ni duplicados', () => {
    const range = buildOperativeDateRange(7, new Date('2026-10-26T00:30:00Z'));
    for (let i = 1; i < range.length; i++) {
      expect(addDaysToDateString(range[i - 1], 1)).toBe(range[i]);
    }
    expect(new Set(range).size).toBe(range.length);
  });

  it('days=1 → solo la fecha operativa (la del botón «Actualizar BD» y el cron)', () => {
    const range = buildOperativeDateRange(1, new Date('2026-10-26T00:30:00Z'));
    expect(range).toEqual(['2026-10-25']);
  });

  it('después del cambio civil el rango termina en el día nuevo', () => {
    const range = buildOperativeDateRange(7, new Date('2026-10-26T05:30:00Z'));
    expect(range[range.length - 1]).toBe('2026-10-26');
    expect(range[0]).toBe('2026-10-20');
  });

  it('rechaza days inválidos (fail-closed)', () => {
    expect(() => buildOperativeDateRange(0)).toThrow();
    expect(() => buildOperativeDateRange(-3)).toThrow();
    expect(() => buildOperativeDateRange(Number.NaN)).toThrow();
  });
});
