/**
 * MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20) — constantes y validación
 * de conceptos del documento Ingresos/Egresos.
 *
 * Los conceptos viven también en el CHECK de la tabla cash_flow_documents
 * (migración 20261021000001). Para añadir un concepto nuevo: extender el
 * CHECK en SQL + este registro + las etiquetas — la estructura es
 * extensible por diseño (§4.C del brief) sin mezclar naturalezas: ventas,
 * cobros, devoluciones comerciales, gastos de proveedores y transferencias
 * de stock tienen módulo propio y NUNCA se registran aquí.
 */

import type { CashFlowConcept } from '@/types';

export type CashFlowDocType = 'ingreso' | 'egreso';

export interface CashFlowConceptDef {
  value: CashFlowConcept;
  label: string;
  shortLabel: string;
  docType: CashFlowDocType;
  /** Conceptos que afectan el fondo de cambio (sub-ledger del fondo). */
  isFondo: boolean;
  description: string;
}

export const CASH_FLOW_CONCEPTS: readonly CashFlowConceptDef[] = [
  {
    value: 'constitucion_fondo',
    label: 'Constitución del fondo de cambio',
    shortLabel: 'Constitución fondo',
    docType: 'ingreso',
    isFondo: true,
    description: 'Dinero entregado a la tienda para crear el fondo de cambio del turno.',
  },
  {
    value: 'reposicion_fondo',
    label: 'Reposición del fondo de cambio',
    shortLabel: 'Reposición fondo',
    docType: 'ingreso',
    isFondo: true,
    description: 'Dinero entregado para reponer el fondo de cambio existente (se distingue de la constitución original).',
  },
  {
    value: 'devolucion_total_fondo',
    label: 'Devolución total del fondo de cambio',
    shortLabel: 'Devolución total',
    docType: 'egreso',
    isFondo: true,
    description: 'Se devuelve todo el fondo de cambio vigente; el fondo queda agotado.',
  },
  {
    value: 'devolucion_parcial_fondo',
    label: 'Devolución parcial del fondo de cambio',
    shortLabel: 'Devolución parcial',
    docType: 'egreso',
    isFondo: true,
    description: 'Se devuelve parte del fondo de cambio vigente; el resto permanece en caja.',
  },
  {
    value: 'otro_ingreso',
    label: 'Otro ingreso de efectivo autorizado',
    shortLabel: 'Otro ingreso',
    docType: 'ingreso',
    isFondo: false,
    description: 'Entrada de efectivo autorizada distinta del fondo de cambio (no es venta ni cobro).',
  },
  {
    value: 'otro_egreso',
    label: 'Otro egreso de efectivo autorizado',
    shortLabel: 'Otro egreso',
    docType: 'egreso',
    isFondo: false,
    description: 'Salida de efectivo autorizada distinta del fondo de cambio (no es gasto de proveedor ni comisión).',
  },
] as const;

export const CONCEPTS_BY_TYPE: Record<CashFlowDocType, readonly CashFlowConceptDef[]> = {
  ingreso: CASH_FLOW_CONCEPTS.filter(c => c.docType === 'ingreso'),
  egreso: CASH_FLOW_CONCEPTS.filter(c => c.docType === 'egreso'),
};

export function getConceptDef(concept: string): CashFlowConceptDef | undefined {
  return CASH_FLOW_CONCEPTS.find(c => c.value === concept);
}

export function conceptLabel(concept: string): string {
  return getConceptDef(concept)?.label ?? concept;
}

export function conceptShortLabel(concept: string): string {
  return getConceptDef(concept)?.shortLabel ?? concept;
}

export function isFondoConcept(concept: string): boolean {
  return getConceptDef(concept)?.isFondo ?? false;
}

/** Conceptos válidos para un tipo (matriz espejo del CHECK de la tabla). */
export function conceptsForType(docType: CashFlowDocType): readonly CashFlowConceptDef[] {
  return CONCEPTS_BY_TYPE[docType];
}

/** ¿La devolución puede/debe vincular la constitución/reposición de origen? */
export function canLinkRelatedDocument(concept: string): boolean {
  return concept === 'devolucion_total_fondo' || concept === 'devolucion_parcial_fondo';
}

export const CASH_FLOW_DOC_TYPE_LABEL: Record<CashFlowDocType, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
};

/** Monedas admitidas por el módulo (efectivo físico del cajón). */
export const CASH_FLOW_CURRENCIES = ['CUP', 'USD'] as const;
export type CashFlowCurrency = (typeof CASH_FLOW_CURRENCIES)[number];

/** Precisión monetaria: máximo 2 decimales (validación compartida UI/API). */
export function hasValidMonetaryPrecision(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 100) === value * 100;
}

export const JUSTIFICATION_MAX_LENGTH = 500;
export const COUNTERPARTY_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 500;
export const ANNULMENT_REASON_MIN_LENGTH = 3;
export const ANNULMENT_REASON_MAX_LENGTH = 500;
