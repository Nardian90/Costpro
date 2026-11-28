/**
 * exchange-history-filters.test.ts — Filtros del tab Histórico
 * (misión CP-FX-UX-REDESIGN-AND-SIMULATOR-CONSOLIDATION-002, FASE 1).
 *
 * CONTRATO:
 *   - Rango por defecto = primer día del MES ACTUAL → fecha operativa de Cuba
 *     (dinámico; jamás codificado a un mes concreto).
 *   - «Todo el período» ELIMINADO: el preset 9999 legado se rechaza al
 *     restaurar preferencias y vuelve al mes actual.
 *   - «Restablecer» = mes actual.
 *   - El filtrado compara STRINGS ISO (inclusivo en ambos extremos) — sin
 *     desfases de zona horaria (la versión Date perdió el último día al este
 *     de UTC).
 *   - Persistencia: sanitizeHistoryFilters valida lo guardado; cualquier
 *     basura vuelve al defecto honesto.
 */
import { describe, it, expect } from 'vitest';
import {
  defaultHistoryFilters,
  resetHistoryFilters,
  sanitizeHistoryFilters,
  filterSeriesByFilters,
  getCurrentMonthRange,
  startOfMonthDateString,
  RANGE_PRESETS,
  type HistoryFilters,
} from '@/lib/exchange-intelligence/history-filters';

const SERIES = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 28)); // 2026-11-28
  d.setUTCDate(d.getUTCDate() - (89 - i));
  const iso = d.toISOString().slice(0, 10);
  return { date: iso, informal: 900 + i };
});

describe('history-filters — rango por defecto (FASE 1.1)', () => {
  it('el default es el mes actual: primer día del mes → hoy', () => {
    const f = defaultHistoryFilters();
    expect(f.preset).toBe('current-month');
    expect(f.useCustomRange).toBe(false);
    const r = getCurrentMonthRange('2026-11-28');
    expect(r.start).toBe('2026-11-01');
    expect(r.end).toBe('2026-11-28');
  });

  it('calcula el primer día del mes dinámicamente (no noviembre-2026 codificado)', () => {
    expect(startOfMonthDateString('2026-01-15')).toBe('2026-01-01');
    expect(startOfMonthDateString('2026-12-31')).toBe('2026-12-01');
    expect(startOfMonthDateString('2027-03-07')).toBe('2027-03-01');
  });

  it('el filtrado por mes actual incluye desde el día 1 y excluye el futuro', () => {
    const f = defaultHistoryFilters();
    const out = filterSeriesByFilters(SERIES, f, '2026-11-28');
    expect(out.every(p => p.date >= '2026-11-01' && p.date <= '2026-11-28')).toBe(true);
    expect(out[0].date).toBe('2026-11-01');
    expect(out[out.length - 1].date).toBe('2026-11-28');
    expect(out).toHaveLength(28);
  });
});

describe('history-filters — «Todo el período» eliminado (FASE 1.3)', () => {
  it('la lista de presets NO contiene «Todo»', () => {
    expect(RANGE_PRESETS.map(p => p.label)).not.toContain('Todo');
    expect(RANGE_PRESETS.map(p => p.id)).toEqual([7, 30, 90, 'current-month']);
  });

  it('un filtro legado { preset: 9999 } se rechaza y vuelve al mes actual', () => {
    const restored = sanitizeHistoryFilters({ preset: 9999, useCustomRange: false });
    expect(restored).toEqual(defaultHistoryFilters());
  });

  it('nunca se selecciona automáticamente todo el histórico (no hay modo «todo»)', () => {
    const f = defaultHistoryFilters();
    const out = filterSeriesByFilters(SERIES, f, '2026-11-28');
    expect(out.length).toBeLessThan(SERIES.length);
  });
});

describe('history-filters — Restablecer (FASE 1.4)', () => {
  it('restablecer devuelve al MES ACTUAL, no al histórico completo', () => {
    // Aunque el usuario tuviera un rango custom amplio, Restablecer vuelve al mes actual.
    const out = filterSeriesByFilters(SERIES, resetHistoryFilters(), '2026-11-28');
    expect(out[0].date).toBe('2026-11-01');
    expect(resetHistoryFilters()).toEqual(defaultHistoryFilters());
  });
});

describe('history-filters — persistencia (FASE 1.2)', () => {
  it('un filtro guardado válido se restaura intacto', () => {
    const saved: HistoryFilters = { preset: 'custom', useCustomRange: true, startDate: '2026-10-01', endDate: '2026-11-15' };
    expect(sanitizeHistoryFilters(saved)).toEqual(saved);
  });

  it('preset numérico se conserva', () => {
    expect(sanitizeHistoryFilters({ preset: 30, useCustomRange: false })).toEqual({
      preset: 30,
      useCustomRange: false,
      startDate: null,
      endDate: null,
    });
  });

  it('custom con fechas invertidas → defecto (mes actual)', () => {
    const out = sanitizeHistoryFilters({ preset: 'custom', startDate: '2026-11-15', endDate: '2026-10-01' });
    expect(out).toEqual(defaultHistoryFilters());
  });

  it('custom con fechas no ISO o ausentes → defecto', () => {
    expect(sanitizeHistoryFilters({ preset: 'custom', startDate: 'no-fecha', endDate: '2026-11-01' })).toEqual(defaultHistoryFilters());
    expect(sanitizeHistoryFilters({ preset: 'custom' })).toEqual(defaultHistoryFilters());
  });

  it('basura (null, número, string) → defecto sin lanzar', () => {
    expect(sanitizeHistoryFilters(null)).toEqual(defaultHistoryFilters());
    expect(sanitizeHistoryFilters(42)).toEqual(defaultHistoryFilters());
    expect(sanitizeHistoryFilters('custom')).toEqual(defaultHistoryFilters());
    expect(sanitizeHistoryFilters({ preset: 'cualquiera' })).toEqual(defaultHistoryFilters());
  });
});

describe('history-filters — límites de fechas por string ISO (FASE 1.1)', () => {
  it('custom incluye AMBOS extremos (inclusivo) sin importar la zona horaria', () => {
    const f: HistoryFilters = { preset: 'custom', useCustomRange: true, startDate: '2026-11-20', endDate: '2026-11-25' };
    const out = filterSeriesByFilters(SERIES, f, '2026-11-28');
    expect(out[0].date).toBe('2026-11-20');
    expect(out[out.length - 1].date).toBe('2026-11-25');
    expect(out).toHaveLength(6);
  });

  it('presets 7/30/90 toman las últimas N fechas', () => {
    expect(filterSeriesByFilters(SERIES, { preset: 7, useCustomRange: false, startDate: null, endDate: null }, '2026-11-28')).toHaveLength(7);
    expect(filterSeriesByFilters(SERIES, { preset: 30, useCustomRange: false, startDate: null, endDate: null }, '2026-11-28')).toHaveLength(30);
    expect(filterSeriesByFilters(SERIES, { preset: 90, useCustomRange: false, startDate: null, endDate: null }, '2026-11-28')).toHaveLength(90);
  });
});
