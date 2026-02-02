/**
 * @file Contrato de datos estricto para la Ficha de Costo (CostSheet).
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para una ficha de costo completa. Elimina `null` y `undefined`
 * para garantizar un estado predecible, especialmente en cálculos recursivos.
 *
 * @see {@link /docs/dias/dia-6-consolidacion.md}
 * @see {@link /src/types/cost-sheet.ts} - Definición original (ahora obsoleta)
 *
 * @author Jules
 * @version 1.0.0
 * @since 2024-01-22
 */

// ============================================
// Tipos Base y Contratos
// ============================================

export interface CostSheetHeaderContract {
  [key: string]: any;
  code: string;
  name: string;
  date: string;
  quantity: number;
  currency: string;
  category: string;
  type: string;
  unit: string;
}

export interface CostSheetRowContract {
  id: string;
  label: string;
  valorHistorico: number;
  value: number;
  baseDeCalculoRef: string;
  baseRef: string;
  calculationMethod: 'Prorrateo' | 'ValorFijo' | 'FORMULA';
  totalFormula: string;
  formula: string;
  isPercent: boolean;
  children: CostSheetRowContract[];
  helpText: string;
  // Mantenemos flexibilidad para propiedades dinámicas, pero con un tipo más explícito.
  [key: string]: any;
}

export interface CostSheetSectionContract {
  id: string;
  label: string;
  rows: CostSheetRowContract[];
}

export interface CostSheetColumnContract {
  key: string;
  label?: string;
  title?: string;
  formula?: string;
  type?: 'number' | 'string' | 'formula' | 'text';
  [key: string]: any;
}

export interface CostSheetAnnexContract {
  id:string;
  title: string;
  columns: CostSheetColumnContract[];
  data: any[]; // Se mantiene flexible por su naturaleza dinámica.
}

export interface CostSheetSignatureContract {
  prepared_by: string;
  approved_by: string;
}

export interface CostSheetDataContract {
  header: CostSheetHeaderContract;
  sections: CostSheetSectionContract[];
  annexes: CostSheetAnnexContract[];
  signature: CostSheetSignatureContract;
}

// ============================================
// Fábricas para Contratos
// ============================================

export const CostSheetRowFactory = {
  create: (
    initialValues?: Partial<CostSheetRowContract>
  ): CostSheetRowContract => ({
    id: `row-${Math.random().toString(36).substr(2, 9)}`,
    label: '',
    valorHistorico: 0,
    value: 0,
    baseDeCalculoRef: '',
    baseRef: '',
    calculationMethod: 'Prorrateo',
    totalFormula: '',
    formula: '',
    isPercent: false,
    children: [],
    helpText: '',
    ...initialValues,
  }),
};

export const CostSheetSectionFactory = {
  create: (
    initialValues?: Partial<CostSheetSectionContract>
  ): CostSheetSectionContract => ({
    id: `section-${Math.random().toString(36).substr(2, 9)}`,
    label: '',
    rows: [],
    ...initialValues,
  }),
};

export const CostSheetHeaderFactory = {
  create: (
    initialValues?: Partial<CostSheetHeaderContract>
  ): CostSheetHeaderContract => ({
    code: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    quantity: 1,
    currency: 'USD',
    category: '',
    type: '',
    unit: 'unidad',
    ...initialValues,
  }),
};

export const CostSheetSignatureFactory = {
  create: (
    initialValues?: Partial<CostSheetSignatureContract>
  ): CostSheetSignatureContract => ({
    prepared_by: '',
    approved_by: '',
    ...initialValues,
  }),
};

export const CostSheetAnnexFactory = {
  create: (
    initialValues?: Partial<CostSheetAnnexContract>
  ): CostSheetAnnexContract => ({
    id: `annex-${Math.random().toString(36).substr(2, 9)}`,
    title: '',
    columns: [],
    data: [],
    ...initialValues,
  }),
};

export const CostSheetDataFactory = {
  /**
   * Crea una ficha de costo completa con valores por defecto.
   */
  create: (
    initialValues?: Partial<CostSheetDataContract>
  ): CostSheetDataContract => ({
    header: CostSheetHeaderFactory.create(),
    sections: [],
    annexes: [],
    signature: CostSheetSignatureFactory.create(),
    ...initialValues,
  }),
};
