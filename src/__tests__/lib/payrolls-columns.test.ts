/**
 * CONFIGURACIÓN DE COLUMNAS + SELECCIÓN DE IMPRESIÓN (misión 2026-11-21).
 *
 * Casos de aceptación cubiertos (misión §9):
 *  · Trabajador sin horas extras → columnas de extras son candidatos a ocultarse.
 *  · Trabajador CON horas extras → NO se detectan como sin datos.
 *  · Todos con complementos cero → ocultables; obligación social cero → ocultable.
 *  · Selección parcial → aggregateSubsetTotals corresponde SOLO a los incluidos
 *    (suma de valores ya calculados por el SERVIDOR — sin fórmulas nuevas).
 *  · Ocultar columna con importes → los cálculos del documento completo intactos
 *    (la agregación sobre TODAS las líneas reproduce los totales del servidor).
 *  · Importes decimales → sin pérdida de redondeo (acumulación en centavos).
 *  · Bloqueadas: Nombres / Neto / RECIBÍ CONFORME siempre presentes y en orden.
 *  · Persistencia tolerante a JSON corrupto.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateSubsetTotals,
  columnHasNoData,
  detectEmptyColumns,
  factsFromEditorLine,
  factsFromItem,
  loadColumnConfig,
  normalizeColumnConfig,
  saveColumnConfig,
  PAYROLL_AUTO_HIDE_CANDIDATES,
  PAYROLL_COLUMN_LOCKED,
  PAYROLL_COLUMNS_DEFAULT,
} from '@/lib/payrolls/columns';
import type { PayrollItem } from '@/lib/payrolls/types';

const baseItem = (over: Partial<PayrollItem>): PayrollItem => ({
  id: 'i-x',
  payroll_id: 'p-1',
  worker_id: 'w-x',
  expediente_laboral: 'EXP-001',
  worker_names: 'Ana Torres',
  categoria_ocupacional: 'Técnico',
  cargo: '',
  area_trabajo: '',
  rate_type: 'hourly',
  rate_amount: 250,
  rate_currency: 'CUP',
  regular_hours: 24,
  accrued_days: 0,
  overtime_hours: 0,
  overtime_amount: 0,
  vacation_days: 0,
  vacation_amount: 0,
  base_salary: 24000,
  total_complementos: 0,
  total_other_earnings: 0,
  total_social_security: 0,
  total_gross: 24000,
  total_deductions: 0,
  total_net: 24000,
  concepts: [],
  ...over,
});

describe('detección de columnas sin datos (REQ1)', () => {
  it('un trabajador SIN horas extras: h_extras e importe_extras son candidatos a ocultarse', () => {
    const facts = [factsFromItem(baseItem({}))];
    const empties = detectEmptyColumns(facts);
    expect(empties).toContain('h_extras');
    expect(empties).toContain('importe_extras');
    expect(empties).toContain('compl_salario');
    expect(empties).toContain('deducciones');
    expect(empties).toContain('vacac_dias');
    expect(empties).toContain('vacac_importe');
  });

  it('un trabajador CON horas extras: las columnas de extras NO se detectan sin datos', () => {
    const facts = [factsFromItem(baseItem({ overtime_hours: 10, overtime_amount: 3750 }))];
    const empties = detectEmptyColumns(facts);
    expect(empties).not.toContain('h_extras');
    expect(empties).not.toContain('importe_extras');
  });

  it('un solo trabajador con importe ≠ 0 impide ocultar la columna (regla «al menos uno»)', () => {
    const facts = [
      factsFromItem(baseItem({})),
      factsFromItem(baseItem({ worker_id: 'w-2', overtime_amount: 0.01 })),
    ];
    expect(detectEmptyColumns(facts)).not.toContain('importe_extras');
  });

  it('todos con complementos cero → ocultable; con complemento → no', () => {
    const allZero = [factsFromItem(baseItem({})), factsFromItem(baseItem({ worker_id: 'w-2' }))];
    expect(columnHasNoData('compl_salario', allZero)).toBe(true);
    const oneHas = [factsFromItem(baseItem({})), factsFromItem(baseItem({
      worker_id: 'w-2', total_complementos: 500, total_gross: 24500, total_net: 24500,
    }))];
    expect(columnHasNoData('compl_salario', oneHas)).toBe(false);
  });

  it('obligación social cero en todos → ocultable (sin tocar fórmulas: solo presentación)', () => {
    const facts = [factsFromItem(baseItem({})), factsFromItem(baseItem({ worker_id: 'w-2' }))];
    expect(columnHasNoData('oblig_social', facts)).toBe(true);
  });

  it('«otros haberes» con sigla aunque importe 0 NO es sin datos (tiene contenido textual)', () => {
    const facts = [factsFromItem(baseItem({
      total_other_earnings: 0,
      concepts: [{ id: 'c-1', item_id: 'i-x', kind: 'otro_haber', sigla: 'CAL', description: '', amount: 0 }],
    }))];
    expect(columnHasNoData('otros_haberes', facts)).toBe(false);
  });

  it('identidad y resultado JAMÁS son candidatos automáticos (misión REQ1.4)', () => {
    const facts = [factsFromItem(baseItem({ expediente_laboral: '', categoria_ocupacional: '' }))];
    const empties = detectEmptyColumns(facts);
    expect(empties).not.toContain('nombres');
    expect(empties).not.toContain('neto');
    expect(empties).not.toContain('recibi_conforme');
    expect(empties).not.toContain('salario_basico');
    expect(empties).not.toContain('tiempo');
    expect(empties).not.toContain('total_devengado');
  });

  it('evalúa valores NUMÉRICOS reales: 0, "0.00", null y vacío equivalen (misión REQ1)', () => {
    const line = {
      overtime_hours: 0, overtime_amount: 0,
      vacation_days: null, vacation_amount: '0.00',
      concepts: [],
    };
    expect(columnHasNoData('importe_extras', [factsFromEditorLine(line)])).toBe(true);
    expect(columnHasNoData('vacac_importe', [factsFromEditorLine(line)])).toBe(true);
    expect(columnHasNoData('expediente', [factsFromEditorLine({ ...line, expediente_laboral: '   ' })])).toBe(true);
  });

  it('sin trabajadores NO se oculta nada (evita vaciar el documento)', () => {
    expect(detectEmptyColumns([])).toEqual([]);
  });

  it('candidatas automáticas ⊆ columnas válidas y nunca incluyen bloqueadas', () => {
    for (const c of PAYROLL_AUTO_HIDE_CANDIDATES) {
      expect(PAYROLL_COLUMNS_DEFAULT).toContain(c);
      expect(PAYROLL_COLUMN_LOCKED).not.toContain(c);
    }
  });
});

describe('configuración normalizada + persistencia (REQ1.7/1.8)', () => {
  it('siempre incluye las bloqueadas y respeta el orden canónico del modelo', () => {
    const cfg = normalizeColumnConfig(['deducciones', 'h_extras', 'bogus', 'nombres', 'deducciones']);
    expect(cfg).toContain('nombres');
    expect(cfg).toContain('neto');
    expect(cfg).toContain('recibi_conforme');
    expect(cfg).not.toContain('bogus');
    expect(cfg.filter((c) => c === 'deducciones')).toHaveLength(1);
    expect(cfg.indexOf('recibi_conforme')).toBe(cfg.length - 1);
  });

  it('«recuperar/restablecer» devuelve la configuración original completa', () => {
    expect(normalizeColumnConfig([...PAYROLL_COLUMNS_DEFAULT])).toEqual([...PAYROLL_COLUMNS_DEFAULT]);
  });

  it('localStorage corrupto o ausente → configuración original (tolerante)', () => {
    const broken = { getItem: () => '{oops' } as Pick<Storage, 'getItem'>;
    expect(loadColumnConfig(broken)).toEqual([...PAYROLL_COLUMNS_DEFAULT]);
    const empty = { getItem: () => null } as Pick<Storage, 'getItem'>;
    expect(loadColumnConfig(empty)).toEqual([...PAYROLL_COLUMNS_DEFAULT]);
    expect(loadColumnConfig(null)).toEqual([...PAYROLL_COLUMNS_DEFAULT]);
  });

  it('guarda y relee una preferencia válida (roundtrip)', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    } as unknown as Pick<Storage, 'getItem' | 'setItem'>;
    saveColumnConfig(fake, normalizeColumnConfig(['deducciones']));
    const read = loadColumnConfig(fake);
    expect(read).toContain('deducciones');
    expect(read).toContain('recibi_conforme');
  });
});

describe('agregación de totales del PIE (REQ2 — presentación, sin fórmulas nuevas)', () => {
  // Fixture del propio documento (mismas cifras que el servidor validaría):
  // Ana (horaria): gross 53100 = 47500+3750+1000+0+850 · net 52600 = 53100−500
  // Luis (diaria): gross 110000 · net 110000
  const ana = baseItem({
    id: 'i-1', worker_id: 'w-1', regular_hours: 190, overtime_hours: 10,
    overtime_amount: 3750, vacation_days: 2, vacation_amount: 10000,
    base_salary: 47500, total_complementos: 1000, total_social_security: 850,
    total_gross: 53100, total_deductions: 500, total_net: 52600,
  });
  const luis = baseItem({
    id: 'i-2', worker_id: 'w-2', rate_type: 'daily', rate_amount: 5000,
    regular_hours: 0, accrued_days: 22, base_salary: 110000,
    total_gross: 110000, total_net: 110000, vacation_amount: 0,
  });

  it('documento completo: la agregación REPRODUCE los totales del servidor (integridad)', () => {
    const t = aggregateSubsetTotals([ana, luis]);
    expect(t.total_workers).toBe(2);
    expect(t.total_regular_hours).toBe(190);
    expect(t.total_accrued_days).toBe(22);
    expect(t.total_overtime_hours).toBe(10);
    expect(t.total_overtime).toBe(3750);
    expect(t.total_complementos).toBe(1000);
    expect(t.total_social_security).toBe(850);
    expect(t.total_gross).toBe(163100);
    expect(t.total_deductions).toBe(500);
    expect(t.total_net).toBe(162600);
    expect(t.total_vacation_days).toBe(2);
    expect(t.total_vacation_amount).toBe(10000);
  });

  it('selección parcial: los totales corresponden EXCLUSIVAMENTE a los incluidos', () => {
    const t = aggregateSubsetTotals([ana]);
    expect(t.total_workers).toBe(1);
    expect(t.total_regular_hours).toBe(190);
    expect(t.total_accrued_days).toBe(0);
    expect(t.total_gross).toBe(53100);
    expect(t.total_net).toBe(52600);
    const t2 = aggregateSubsetTotals([luis]);
    expect(t2.total_workers).toBe(1);
    expect(t2.total_regular_hours).toBe(0);
    expect(t2.total_accrued_days).toBe(22);
    expect(t2.total_net).toBe(110000);
  });

  it('importes decimales: sin pérdidas ni errores de redondeo (centavos exactos)', () => {
    const items = [1, 2, 3].map((i) => baseItem({
      id: `i-d${i}`, worker_id: `w-d${i}`, total_gross: 0.1, total_net: 0.1,
      total_deductions: 0,
    }));
    const t = aggregateSubsetTotals(items);
    expect(t.total_gross).toBeCloseTo(0.3, 10);
    expect(t.total_net).toBeCloseTo(0.3, 10);
  });
});
