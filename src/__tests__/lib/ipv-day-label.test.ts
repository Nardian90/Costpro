/**
 * FIX DESFASE DE FECHAS IPV (2026-11-06) — pruebas del rotulado del período.
 *
 * Síntoma corregido: se seleccionaba 2026-11-06 → 2026-11-06 y el PDF mostraba
 * «05/11/2026 → 05/11/2026». Causa raíz: `new Date('YYYY-MM-DD')` se interpreta
 * como medianoche UTC y `toLocaleDateString` renderiza en la TZ local del
 * navegador (America/Havana, UTC−5) → día anterior.
 *
 * formatDayLabel formatea por PARTES sin Date ni TZ: el día elegido es el que
 * se imprime, independientemente de la zona horaria del entorno de ejecución.
 */
import { describe, it, expect } from 'vitest';
import { formatDayLabel } from '@/lib/ipv-ventas/format';
import { businessDayWindow, BUSINESS_TIMEZONE } from '@/lib/cash-report/period-attribution';

describe('formatDayLabel — etiqueta del período del PDF IPV', () => {
  // Casos obligatorios de la misión (tabla de aceptación)
  it('caso 1: un solo día 2026-11-06 → 06/11/2026', () => {
    expect(formatDayLabel('2026-11-06')).toBe('06/11/2026');
  });

  it('caso 2: dos días 2026-11-05 → 2026-11-06', () => {
    expect(formatDayLabel('2026-11-05')).toBe('05/11/2026');
    expect(formatDayLabel('2026-11-06')).toBe('06/11/2026');
  });

  it('caso 3: cambio de mes 2026-10-31 → 2026-11-06', () => {
    expect(formatDayLabel('2026-10-31')).toBe('31/10/2026');
    expect(formatDayLabel('2026-11-06')).toBe('06/11/2026');
  });

  it('NO depende de la zona horaria del entorno (TZ UTC−5 como Habana)', () => {
    // Simulación del bug original: new Date('2026-11-06') en TZ UTC−5 cae el
    // 05/11 local. El formateo por partes nunca debe desplazarse.
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/Havana';
      expect(formatDayLabel('2026-11-06')).toBe('06/11/2026');
      expect(formatDayLabel('2026-01-01')).toBe('01/01/2026');
      expect(formatDayLabel('2026-12-31')).toBe('31/12/2026');
    } finally {
      if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
    }
  });

  it('acepta ISO completo usando su parte de fecha', () => {
    expect(formatDayLabel('2026-11-06T21:00:00.000Z')).toBe('06/11/2026');
  });

  it('entrada inválida se devuelve tal cual (sin inventar fechas)', () => {
    expect(formatDayLabel('')).toBe('');
    expect(formatDayLabel('no-es-fecha')).toBe('no-es-fecha');
  });
});

describe('businessDayWindow — ventana canónica del día de negocio (America/Havana)', () => {
  it('la zona horaria de negocio es America/Havana', () => {
    expect(BUSINESS_TIMEZONE).toBe('America/Havana');
  });

  it('ventana inclusiva de un día completo: 86399999 ms de duración efectiva', () => {
    const w = businessDayWindow('2026-11-06');
    const start = new Date(w.startIso).getTime();
    const end = new Date(w.endIso).getTime();
    expect(end - start).toBe(86_399_999);
    // Los límites deben ser ISO con Z
    expect(w.startIso.endsWith('Z')).toBe(true);
    expect(w.endIso.endsWith('Z')).toBe(true);
  });

  it('el día 2026-11-06 (Habana) comienza a medianoche local (UTC−5 → 05:00Z)', () => {
    const w = businessDayWindow('2026-11-06');
    // Cuba abandona el DST (2025+): Habana permanente UTC−5 → 00:00 local = 05:00Z
    expect(w.startIso).toBe('2026-11-06T05:00:00.000Z');
    expect(w.endIso).toBe('2026-11-07T04:59:59.999Z');
  });

  it('determinista: produce la misma ventana desde TZ UTC', () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const w = businessDayWindow('2026-11-06');
      expect(w.startIso).toBe('2026-11-06T05:00:00.000Z');
    } finally {
      if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
    }
  });

  it('una venta de las 20:00 de Habana cae DENTRO de su día de negocio', () => {
    // Venta del 06/11 a las 20:00 Habana = 2026-11-07T01:00:00Z — debe quedar
    // incluida en la ventana del día 2026-11-06 (límites inclusivos correctos).
    const w = businessDayWindow('2026-11-06');
    const sale = '2026-11-07T01:00:00.000Z';
    expect(sale >= w.startIso && sale <= w.endIso).toBe(true);
  });

  it('rechaza entradas que no son date-only', () => {
    expect(() => businessDayWindow('2026-11-06T10:00:00Z')).toThrow();
  });
});
