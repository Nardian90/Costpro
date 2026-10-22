/**
 * cash-report-options-persistence.test.ts — MISIÓN 2026-10-22 (Parte A).
 *
 * Prueba las implementaciones REALES de la persistencia de preferencias del
 * Reporte Entrega (no mocks):
 *   · loadPdfOptions/savePdfOptions (cash-report-pdf.ts): clave versionada
 *     'costpro:cash-report:pdf-options:v1', validación clave a clave,
 *     defaults SOLO cuando no hay preferencia válida, recuperación segura
 *     ante JSON corrupto/antiguo, sin datos de ventas ni info sensible.
 *   · loadWorkingBreakdown/saveWorkingBreakdown/clearWorkingBreakdown
 *     (cash-report-core.ts): conteo laboral { CUP, USD, savedAt }, validación
 *     de denominaciones/cantidades, recuperación segura, borrado con Limpiar.
 *   · REGRESIÓN del defecto original: las opciones del documento NO existían
 *     en localStorage (solo estado en memoria) y «Guardar desglose» solo
 *     creaba una entrada de historial — ambas persistencias son nuevas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPdfOptions, savePdfOptions, DEFAULT_PDF_OPTIONS } from '@/components/views/terminal/views/cash/cash-report-pdf';
import {
  loadWorkingBreakdown, saveWorkingBreakdown, clearWorkingBreakdown,
  LS_KEYS, CUP_DEFAULT_DENOMS, USD_DEFAULT_DENOMS,
} from '@/components/views/terminal/views/cash/cash-report-core';

const OPTIONS_KEY = LS_KEYS.pdfOptions;
const WORKING_KEY = LS_KEYS.workingBreakdown;

beforeEach(() => {
  window.localStorage.clear();
});

describe('loadPdfOptions / savePdfOptions — opciones del documento (Parte A)', () => {
  it('sin preferencia guardada → defaults EXACTOS (B-1: solo aplican sin preferencia previa)', () => {
    expect(loadPdfOptions()).toEqual(DEFAULT_PDF_OPTIONS);
    // Los cuatro valores predeterminados exigidos por la misión (Parte B)
    expect(loadPdfOptions().includeBreakdown).toBe(true);   // Desglose de billetes
    expect(loadPdfOptions().includeUsd).toBe(true);         // Cuadre USD
    expect(loadPdfOptions().includeSignature).toBe(true);   // Líneas de firma
    expect(loadPdfOptions().usdSeparatePage).toBe(true);    // USD en hoja separada
    expect(loadPdfOptions().includeCashBreakdown).toBe(true); // Desglose de efectivo
  });

  it('guardar y recargar conserva la preferencia (desactivada persiste desactivada, B-2)', () => {
    const opts = { ...DEFAULT_PDF_OPTIONS, includeBreakdown: false, usdSeparatePage: false };
    savePdfOptions(opts);
    const loaded = loadPdfOptions();
    expect(loaded.includeBreakdown).toBe(false);
    expect(loaded.usdSeparatePage).toBe(false);
    expect(loaded.includeUsd).toBe(true); // intactas
  });

  it('reactivar persiste reactivada (B-3)', () => {
    savePdfOptions({ ...DEFAULT_PDF_OPTIONS, includeBreakdown: false });
    savePdfOptions({ ...DEFAULT_PDF_OPTIONS, includeBreakdown: true });
    expect(loadPdfOptions().includeBreakdown).toBe(true);
  });

  it('JSON corrupto → recuperación segura con defaults (F-7)', () => {
    localStorage.setItem(OPTIONS_KEY, '{esto no es json');
    expect(loadPdfOptions()).toEqual(DEFAULT_PDF_OPTIONS);
    localStorage.setItem(OPTIONS_KEY, 'null');
    expect(loadPdfOptions()).toEqual(DEFAULT_PDF_OPTIONS);
    localStorage.setItem(OPTIONS_KEY, '[1,2,3]');
    expect(loadPdfOptions()).toEqual(DEFAULT_PDF_OPTIONS);
  });

  it('JSON antiguo con claves desconocidas/no booleanas → claves válidas se respetan, resto conserva default', () => {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({
      includeSignature: false,          // válida → se respeta
      includeBreakdown: 'sí',           // no booleana → default
      unaClaveDesconocida: true,        // desconocida → se descarta
      usdSeparatePage: false,           // válida → se respeta
    }));
    const loaded = loadPdfOptions();
    expect(loaded.includeSignature).toBe(false);
    expect(loaded.usdSeparatePage).toBe(false);
    expect(loaded.includeBreakdown).toBe(true); // default conservado
    expect((loaded as unknown as Record<string, unknown>).unaClaveDesconocida).toBeUndefined();
  });

  it('el esquema persistido NO contiene datos de ventas ni información sensible', () => {
    savePdfOptions(DEFAULT_PDF_OPTIONS);
    const raw = localStorage.getItem(OPTIONS_KEY) || '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Solo claves booleanas conocidas del dominio de opciones
    for (const [k, v] of Object.entries(parsed)) {
      expect(Object.keys(DEFAULT_PDF_OPTIONS)).toContain(k);
      expect(typeof v).toBe('boolean');
    }
  });
});

describe('loadWorkingBreakdown / saveWorkingBreakdown — desglose laboral (Parte A)', () => {
  it('sin guarda → conteos vacíos (comportamiento previo legítimo, sin inventar)', () => {
    const wb = loadWorkingBreakdown();
    expect(wb.CUP).toEqual({});
    expect(wb.USD).toEqual({});
    expect(wb.savedAt).toBe('');
  });

  it('guardar y recargar conserva el conteo exacto por denominación (F-6)', () => {
    saveWorkingBreakdown({ CUP: { 1000: '169', 500: '3' }, USD: { 100: '1' }, savedAt: '2026-10-22T01:00:00.000Z' });
    const wb = loadWorkingBreakdown();
    expect(wb.CUP).toEqual({ 1000: '169', 500: '3' });
    expect(wb.USD).toEqual({ 100: '1' });
    expect(wb.savedAt).toBe('2026-10-22T01:00:00.000Z');
  });

  it('JSON corrupto → recuperación segura con conteos vacíos', () => {
    localStorage.setItem(WORKING_KEY, 'no-json');
    expect(loadWorkingBreakdown().CUP).toEqual({});
    localStorage.setItem(WORKING_KEY, JSON.stringify({ CUP: 'no-objeto', USD: { '-5': '3', 'abc': '1', '100': '2' } }));
    const wb = loadWorkingBreakdown();
    expect(wb.CUP).toEqual({});
    expect(wb.USD).toEqual({ 100: '2' }); // solo la denominación válida con cantidad válida
  });

  it('valores negativos o decimales se sanean al persistir (enteros no negativos)', () => {
    // Cantidad numérica negativa (vía JSON externo) → '0'; decimal → floor.
    saveWorkingBreakdown({ CUP: { 1000: -3, 500: '2.7' }, USD: {}, savedAt: 'x' } as unknown as Parameters<typeof saveWorkingBreakdown>[0]);
    const wb = loadWorkingBreakdown();
    expect(wb.CUP['1000']).toBe('0');
    expect(wb.CUP['500']).toBe('2');
  });

  it('clearWorkingBreakdown borra la preferencia (Limpiar no deja conteos fantasma)', () => {
    saveWorkingBreakdown({ CUP: { 1000: '1' }, USD: {}, savedAt: 'x' });
    expect(localStorage.getItem(WORKING_KEY)).toBeTruthy();
    clearWorkingBreakdown();
    expect(localStorage.getItem(WORKING_KEY)).toBeNull();
    expect(loadWorkingBreakdown().CUP).toEqual({});
  });

  it('no persiste nada fuera de { CUP, USD, savedAt } — sin datos de ventas', () => {
    saveWorkingBreakdown({ CUP: { 100: '2' }, USD: {}, savedAt: 'x' });
    const parsed = JSON.parse(localStorage.getItem(WORKING_KEY) || '{}') as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['CUP', 'USD', 'savedAt']);
  });

  it('el conteo se mantiene independiente de las denominaciones activas del catálogo', () => {
    // una denominación fuera del catálogo por defecto sigue siendo válida si
    // fue personalizada por el usuario (el catálogo ampliable la reconoce)
    saveWorkingBreakdown({ CUP: { 300: '5' }, USD: { 25: '2' }, savedAt: 'x' });
    const wb = loadWorkingBreakdown();
    expect(wb.CUP['300']).toBe('5');
    expect(wb.USD['25']).toBe('2');
    void CUP_DEFAULT_DENOMS; void USD_DEFAULT_DENOMS;
  });
});
