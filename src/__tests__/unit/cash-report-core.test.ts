/**
 * cash-report-core — Tests de la lógica PURA del Reporte de Caja — Entrega.
 *
 * CAMBIO 2026-10 (vista dedicada CashReportView):
 *   §3 Persistencia de la plantilla: validación canónica + default seguro.
 *   §5.2 Denominaciones CUP: 2000 y 5000 presentes en el catálogo default.
 *   §5.3 Personalizadas: validación numérica, no duplicados POR MONEDA,
 *        eliminación sin afectar a las demás.
 *   §5.4 Integridad: subtotal = denominación × cantidad; monedas separadas;
 *        sin conversión cambiaria (esperado USD = misma fórmula de la API
 *        aplicada client-side).
 *   §2  Configuración vs cálculo: validación de intervalo y obsolescencia.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TEMPLATES, validatePdfTemplate, DEFAULT_PDF_TEMPLATE,
  CUP_DEFAULT_DENOMS, USD_DEFAULT_DENOMS, LS_KEYS,
  loadPdfTemplate, savePdfTemplate,
  loadEnabledDenoms, saveEnabledDenoms,
  loadCustomDenoms, saveCustomDenoms,
  validateCustomDenom, addCustomDenom, removeCustomDenom,
  sanitizeCount, denomSubtotal, breakdownTotal, suggestBreakdown,
  computeExpectedCash, isDateRangeInvalid, isReportStale,
  formatDenomValue, formatUsd,
  type CustomDenoms,
} from '@/components/views/terminal/views/cash/cash-report-core';
import type { CashReport } from '@/types';

beforeEach(() => {
  localStorage.clear();
});

// ── §3 Plantilla ────────────────────────────────────────────────────────────
describe('Plantilla PDF — persistencia y validación canónica', () => {
  it('los ids canónicos son estandar/simple/diario', () => {
    expect(TEMPLATES.map(t => t.id)).toEqual(['estandar', 'simple', 'diario']);
    expect(DEFAULT_PDF_TEMPLATE).toBe('estandar');
  });

  it('validatePdfTemplate acepta valores canónicos y rechaza inválidos con default', () => {
    expect(validatePdfTemplate('diario')).toBe('diario');
    expect(validatePdfTemplate('simple')).toBe('simple');
    expect(validatePdfTemplate('estandar')).toBe('estandar');
    expect(validatePdfTemplate('noexiste')).toBe('estandar');
    expect(validatePdfTemplate(42)).toBe('estandar');
    expect(validatePdfTemplate(null)).toBe('estandar');
    expect(validatePdfTemplate(undefined)).toBe('estandar');
    expect(validatePdfTemplate({ malicious: true })).toBe('estandar');
  });

  it('round-trip: se guarda y se restaura la preferencia', () => {
    savePdfTemplate('diario');
    expect(localStorage.getItem(LS_KEYS.pdfTemplate)).toBe('diario');
    expect(loadPdfTemplate()).toBe('diario');
  });

  it('valor corrupto guardado → default legítimo sin errores (§3.4)', () => {
    localStorage.setItem(LS_KEYS.pdfTemplate, '"valor-viejo-incompatible"');
    expect(loadPdfTemplate()).toBe('estandar');
    localStorage.setItem(LS_KEYS.pdfTemplate, '{"objeto":true}');
    expect(loadPdfTemplate()).toBe('estandar');
  });
});

// ── §5.2 Catálogos ──────────────────────────────────────────────────────────
describe('Denominaciones — catálogos CUP/USD', () => {
  it('CUP incluye 2000 y 5000 y está ordenado descendentemente (§5.2)', () => {
    expect(CUP_DEFAULT_DENOMS).toContain(2000);
    expect(CUP_DEFAULT_DENOMS).toContain(5000);
    const sorted = [...CUP_DEFAULT_DENOMS].sort((a, b) => b - a);
    expect(CUP_DEFAULT_DENOMS).toEqual(sorted);
  });

  it('USD no comparte las denominaciones grandes de CUP', () => {
    expect(USD_DEFAULT_DENOMS).toEqual([100, 50, 20, 10, 5, 1]);
    expect(USD_DEFAULT_DENOMS).not.toContain(2000);
  });

  it('loadEnabledDenoms: JSON corrupto → catálogo completo por moneda', () => {
    localStorage.setItem(LS_KEYS.cupDenoms, '{corrupto');
    expect(loadEnabledDenoms('CUP')).toEqual(CUP_DEFAULT_DENOMS);
    localStorage.setItem(LS_KEYS.usdDenoms, '[99999]');
    // 99999 no pertenece al catálogo USD → filtrado; vacío → default
    expect(loadEnabledDenoms('USD')).toEqual(USD_DEFAULT_DENOMS);
  });

  it('loadEnabledDenoms: array vacío guardado → default (no desaparece el catálogo)', () => {
    saveEnabledDenoms('CUP', []);
    expect(loadEnabledDenoms('CUP')).toEqual(CUP_DEFAULT_DENOMS);
  });

  it('loadEnabledDenoms respeta la selección válida persistida', () => {
    saveEnabledDenoms('CUP', [1000, 500, 2000]);
    expect(loadEnabledDenoms('CUP')).toEqual([2000, 1000, 500]);
  });
});

// ── §5.3 Personalizadas ─────────────────────────────────────────────────────
describe('Denominaciones personalizadas — validación por moneda', () => {
  it('rechaza no numérico, infinito, cero y negativos', () => {
    const empty: CustomDenoms = { CUP: [], USD: [] };
    expect(validateCustomDenom('abc', 'CUP', empty).ok).toBe(false);
    expect(validateCustomDenom(Infinity, 'CUP', empty).ok).toBe(false);
    expect(validateCustomDenom(NaN, 'CUP', empty).ok).toBe(false);
    expect(validateCustomDenom(0, 'CUP', empty).ok).toBe(false);
    expect(validateCustomDenom(-5, 'CUP', empty).ok).toBe(false);
    expect(validateCustomDenom('', 'CUP', empty).ok).toBe(false);
  });

  it('rechaza duplicados equivalentes dentro de la misma moneda y contra el catálogo', () => {
    const state: CustomDenoms = { CUP: [300], USD: [] };
    expect(validateCustomDenom(300, 'CUP', state).ok).toBe(false);
    expect(validateCustomDenom('300', 'CUP', state).ok).toBe(false);
    expect(validateCustomDenom(1000, 'CUP', state).ok).toBe(false); // default
    expect(validateCustomDenom(100, 'USD', state).ok).toBe(false);  // default USD
    expect(validateCustomDenom(250, 'USD', state).ok).toBe(true);
  });

  it('el espacio de monedas es independiente: una denominación CUP no existe en USD', () => {
    const state: CustomDenoms = { CUP: [300], USD: [] };
    expect(validateCustomDenom(300, 'USD', state).ok).toBe(true);
    expect(validateCustomDenom(100, 'CUP', state).ok).toBe(false); // default CUP
  });

  it('addCustomDenom mantiene orden descendente y no muta el estado previo', () => {
    const state: CustomDenoms = { CUP: [300], USD: [] };
    const next = addCustomDenom(state, 'CUP', 700);
    expect(next.CUP).toEqual([700, 300]);
    expect(state.CUP).toEqual([300]);
  });

  it('removeCustomDenom elimina solo la elegida sin afectar a las demás', () => {
    const state: CustomDenoms = { CUP: [700, 300, 250], USD: [25] };
    const next = removeCustomDenom(state, 'CUP', 300);
    expect(next.CUP).toEqual([700, 250]);
    expect(next.USD).toEqual([25]);
    // eliminar una que no existe no cambia nada
    expect(removeCustomDenom(next, 'CUP', 999).CUP).toEqual([700, 250]);
  });

  it('persistencia v1: round-trip y saneado de valores inválidos', () => {
    saveCustomDenoms({ CUP: [300, 700], USD: [25] });
    expect(loadCustomDenoms()).toEqual({ CUP: [700, 300], USD: [25] });
    localStorage.setItem(LS_KEYS.customDenoms, '{"CUP":[300,-5,"abc",null,700],"USD":"no-array"}');
    const cleaned = loadCustomDenoms();
    expect(cleaned.CUP).toEqual([700, 300]);
    expect(cleaned.USD).toEqual([]);
  });
});

// ── §5.1/§5.4 Conteo e integridad ───────────────────────────────────────────
describe('Conteo y totales — subtotal = denominación × cantidad', () => {
  it('sanitizeCount: vacío se conserva, negativos→0, decimales→entero', () => {
    expect(sanitizeCount('')).toBe('');
    expect(sanitizeCount('-')).toBe('');
    expect(sanitizeCount('-3')).toBe('0');
    expect(sanitizeCount('2.7')).toBe('2');
    expect(sanitizeCount('abc')).toBe('0');
    expect(sanitizeCount('12')).toBe('12');
  });

  it('subtotal y total: cada denominación entra una sola vez (§5.4)', () => {
    expect(denomSubtotal(2000, '3')).toBe(6000);
    expect(denomSubtotal(500, '')).toBe(0);
    const bd = { 5000: '1', 2000: '2', 100: '5' };
    expect(breakdownTotal(bd)).toBe(5000 + 4000 + 500);
  });

  it('desglose sugerido greedy con denominaciones activas (incluye 2000/5000)', () => {
    const s = suggestBreakdown(7000, [5000, 2000, 1000, 500]);
    expect(s).toEqual({ 5000: '1', 2000: '1' });
    // 250 → 200 + 50 con catálogo estándar
    expect(suggestBreakdown(250, CUP_DEFAULT_DENOMS)).toEqual({ 200: '1', 50: '1' });
  });

  it('esperado ≤ 0 → desglose vacío (no hay efectivo que desglosar)', () => {
    expect(suggestBreakdown(0, CUP_DEFAULT_DENOMS)).toEqual({});
    expect(suggestBreakdown(-100, CUP_DEFAULT_DENOMS)).toEqual({});
  });

  it('computeExpectedCash replica la fórmula de /api/cash-report por moneda, sin conversión', () => {
    const report = {
      sales: [
        { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 20000 },
        { payment_method: 'transfer', currency: 'CUP', transaction_count: 1, total: 9000 },
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 150 },
      ],
      payments: [
        { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', payment_count: 1, total: 7000 },
        { payment_method: 'cash', currency: 'USD', ref_type: 'receipt', payment_count: 1, total: 20 },
      ],
      commissions: [
        { payment_method: 'cash', currency: 'CUP', commission_count: 1, total: 3000 },
      ],
      production: [
        { payment_method: 'cash', currency: 'CUP', ref_type: 'work', payment_count: 1, total: 5000 },
        { payment_method: 'cash', currency: 'USD', ref_type: 'work', payment_count: 1, total: 50 },
      ],
    } as unknown as CashReport;
    // CUP: 20000 + 5000 − 7000 − 3000 = 15000
    expect(computeExpectedCash(report, 'CUP')).toBe(15000);
    // USD: 150 + 50 − 20 − 0 = 180 (separado, sin conversión)
    expect(computeExpectedCash(report, 'USD')).toBe(180);
  });

  it('formatDenomValue y formatUsd siguen la convención de cada moneda', () => {
    // CUP usa agrupación por locale del runtime (ICU del navegador la trae);
    // el contrato testeable aquí: delega en toLocaleString('es-ES').
    expect(formatDenomValue(5000, 'CUP')).toBe((5000).toLocaleString('es-ES'));
    expect(formatDenomValue(50, 'USD')).toBe('50.00');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});

// ── §2 Configuración vs cálculo ─────────────────────────────────────────────
describe('Intervalo y obsolescencia', () => {
  it('isDateRangeInvalid detecta invertidos y vacíos', () => {
    expect(isDateRangeInvalid({ startDate: '2026-10-10', endDate: '2026-10-01' })).toBe(true);
    expect(isDateRangeInvalid({ startDate: '', endDate: '2026-10-01' })).toBe(true);
    expect(isDateRangeInvalid({ startDate: '2026-10-01', endDate: '' })).toBe(true);
    expect(isDateRangeInvalid({ startDate: '2026-10-01', endDate: '2026-10-01' })).toBe(false);
    expect(isDateRangeInvalid({ startDate: '2026-10-01', endDate: '2026-10-31' })).toBe(false);
  });

  it('isReportStale: cambia solo la plantilla → NO es obsoleto (es presentación)', () => {
    const applied = { startDate: '2026-10-01', endDate: '2026-10-05' };
    expect(isReportStale(applied, { startDate: '2026-10-01', endDate: '2026-10-05' })).toBe(false);
  });

  it('isReportStale: cambian las fechas → obsoleto', () => {
    const applied = { startDate: '2026-10-01', endDate: '2026-10-05' };
    expect(isReportStale(applied, { startDate: '2026-10-01', endDate: '2026-10-07' })).toBe(true);
    expect(isReportStale(applied, { startDate: '2026-09-01', endDate: '2026-10-05' })).toBe(true);
  });

  it('isReportStale: sin resultados aplicados → nunca obsoleto', () => {
    expect(isReportStale(null, { startDate: '2026-10-01', endDate: '2026-10-05' })).toBe(false);
  });
});
