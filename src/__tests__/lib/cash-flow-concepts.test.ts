/**
 * Lib de conceptos del documento Ingreso/Egreso — MISIÓN 2026-10-20.
 * Matriz tipo↔concepto, etiquetas, fondo, precisión monetaria.
 */
import { describe, it, expect } from 'vitest';
import {
  CASH_FLOW_CONCEPTS,
  CONCEPTS_BY_TYPE,
  conceptsForType,
  getConceptDef,
  conceptLabel,
  conceptShortLabel,
  isFondoConcept,
  canLinkRelatedDocument,
  hasValidMonetaryPrecision,
  CASH_FLOW_CURRENCIES,
} from '@/lib/cash-flow/constants';

describe('CASH_FLOW_CONCEPTS — matriz tipo↔concepto (espejo del CHECK DB)', () => {
  it('los 7 conceptos existen con etiquetas en español (v2.24 añade entrega_efectivo)', () => {
    expect(CASH_FLOW_CONCEPTS.map(c => c.value)).toEqual([
      'constitucion_fondo',
      'reposicion_fondo',
      'devolucion_total_fondo',
      'devolucion_parcial_fondo',
      'otro_ingreso',
      'otro_egreso',
      'entrega_efectivo',
    ]);
    for (const c of CASH_FLOW_CONCEPTS) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.description.length).toBeGreaterThan(10);
    }
  });

  it('ingresos: constitución, reposición y otro ingreso', () => {
    expect(CONCEPTS_BY_TYPE.ingreso.map(c => c.value)).toEqual([
      'constitucion_fondo', 'reposicion_fondo', 'otro_ingreso',
    ]);
  });

  it('egresos: devolución total, devolución parcial, otro egreso y entrega de efectivo (v2.24)', () => {
    expect(CONCEPTS_BY_TYPE.egreso.map(c => c.value)).toEqual([
      'devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso', 'entrega_efectivo',
    ]);
  });

  it('ningún concepto aparece en ambos tipos (matriz sin ambigüedad)', () => {
    const ingresos = new Set(CONCEPTS_BY_TYPE.ingreso.map(c => c.value));
    const egresos = new Set(CONCEPTS_BY_TYPE.egreso.map(c => c.value));
    for (const c of ingresos) expect(egresos.has(c)).toBe(false);
    for (const c of egresos) expect(ingresos.has(c)).toBe(false);
    expect(conceptsForType('ingreso').length + conceptsForType('egreso').length).toBe(CASH_FLOW_CONCEPTS.length);
  });

  it('conceptos de FONDO: constitución/reposición/devoluciones (no otros)', () => {
    expect(isFondoConcept('constitucion_fondo')).toBe(true);
    expect(isFondoConcept('reposicion_fondo')).toBe(true);
    expect(isFondoConcept('devolucion_total_fondo')).toBe(true);
    expect(isFondoConcept('devolucion_parcial_fondo')).toBe(true);
    expect(isFondoConcept('otro_ingreso')).toBe(false);
    expect(isFondoConcept('otro_egreso')).toBe(false);
    expect(isFondoConcept('desconocido')).toBe(false);
  });

  it('la reposición se distingue de la constitución (requisito §4.A)', () => {
    expect(getConceptDef('reposicion_fondo')?.label).not.toBe(getConceptDef('constitucion_fondo')?.label);
    expect(conceptLabel('reposicion_fondo')).toContain('Reposición');
    expect(conceptLabel('constitucion_fondo')).toContain('Constitución');
    expect(conceptShortLabel('devolucion_parcial_fondo')).toBe('Devolución parcial');
  });

  it('solo las devoluciones de fondo pueden vincular documento origen', () => {
    expect(canLinkRelatedDocument('devolucion_total_fondo')).toBe(true);
    expect(canLinkRelatedDocument('devolucion_parcial_fondo')).toBe(true);
    expect(canLinkRelatedDocument('constitucion_fondo')).toBe(false);
    expect(canLinkRelatedDocument('otro_ingreso')).toBe(false);
    expect(canLinkRelatedDocument('otro_egreso')).toBe(false);
  });

  it('monedas admitidas: CUP y USD (efectivo físico del cajón)', () => {
    expect([...CASH_FLOW_CURRENCIES]).toEqual(['CUP', 'USD']);
  });

  it('precisión monetaria: máximo 2 decimales', () => {
    expect(hasValidMonetaryPrecision(0.01)).toBe(true);
    expect(hasValidMonetaryPrecision(5000)).toBe(true);
    expect(hasValidMonetaryPrecision(5000.55)).toBe(true);
    expect(hasValidMonetaryPrecision(0.001)).toBe(false);
    expect(hasValidMonetaryPrecision(5000.123)).toBe(false);
    expect(hasValidMonetaryPrecision(0)).toBe(true);
    expect(hasValidMonetaryPrecision(-1)).toBe(true); // el signo lo valida la API/RPC
    expect(hasValidMonetaryPrecision(NaN)).toBe(false);
    expect(hasValidMonetaryPrecision(Infinity)).toBe(false);
  });
});

describe('Fondo de cambio — matemática del sub-ledger (ejemplo del brief §4.B)', () => {
  it('fondo inicial 5.000 − devolución parcial 2.000 ⇒ saldo de fondo 3.000', () => {
    const fondoInicial = 5000;
    const devolucionParcial = 2000;
    const fondoVigente = fondoInicial - devolucionParcial;
    expect(fondoVigente).toBe(3000);
  });

  it('constitución + reposición − devoluciones = fondo vigente (canonical CUP)', () => {
    // espejo de la fórmula del RPC get_cash_flow_summary:
    //   fondo = opening + Σ(fondo in) − Σ(fondo out)  [docs confirmados]
    const docs = [
      { concept: 'constitucion_fondo', doc_type: 'ingreso', amount_cup: 5000, status: 'confirmado' },
      { concept: 'reposicion_fondo', doc_type: 'ingreso', amount_cup: 1500, status: 'confirmado' },
      { concept: 'devolucion_parcial_fondo', doc_type: 'egreso', amount_cup: 2000, status: 'confirmado' },
      { concept: 'otro_ingreso', doc_type: 'ingreso', amount_cup: 999, status: 'confirmado' }, // NO es fondo
      { concept: 'devolucion_total_fondo', doc_type: 'egreso', amount_cup: 4500, status: 'anulado' }, // anulado NO cuenta
    ] as const;
    const opening = 0;
    const fondo = opening + docs
      .filter(d => d.status === 'confirmado' && isFondoConcept(d.concept))
      .reduce((s, d) => s + (d.doc_type === 'ingreso' ? d.amount_cup : -d.amount_cup), 0);
    expect(fondo).toBe(5000 + 1500 - 2000);
    expect(fondo).toBe(4500);
  });
});
