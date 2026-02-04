/**
 * @file Contrato de datos estricto para la Ficha de Costo (CostSheet).
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para una ficha de costo completa. Elimina `null` y `undefined`
 * para garantizar un estado predecible, especialmente en cálculos recursivos.
 *
 * @author Jules
 * @version 1.1.0
 * @since 2024-02-27
 */

// ============================================
// Tipos Base y Contratos (Hardened)
// ============================================

export interface CostSheetHeaderContract {
  code: string;
  name: string;
  date: string;
  quantity: number;
  currency: string;
  category: string;
  type: string;
  unit: string;
  [key: string]: any;
}

export interface CostSheetRowContract {
  id: string;
  label: string;
  valor_historico: number;
  base_ref: string;
  calculation_method: 'Prorrateo' | 'ValorFijo' | 'FORMULA' | 'ANEXO';
  formula: string;
  is_percent: boolean;
  children: CostSheetRowContract[];
  helpText: string;
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
  id: string;
  title: string;
  columns: CostSheetColumnContract[];
  data: any[];
}

export interface CostSheetSignatureContract {
  prepared_by: string;
  approved_by: string;
}

export interface CostSheetDataContract {
  id?: string;
  name?: string;
  version?: string;
  metadata?: any;
  header: CostSheetHeaderContract;
  sections: CostSheetSectionContract[];
  annexes: CostSheetAnnexContract[];
  signature: CostSheetSignatureContract;
  footer?: string;
  [key: string]: any;
}

// ============================================
// Fábricas para Contratos
// ============================================

export const CostSheetRowFactory = {
  create: (
    initialValues?: Partial<CostSheetRowContract>
  ): CostSheetRowContract => ({
    id: `row-${Math.random().toString(36).substring(2, 11)}`,
    label: '',
    valor_historico: 0,
    base_ref: '',
    calculation_method: 'ValorFijo',
    formula: '',
    is_percent: false,
    children: [],
    helpText: '',
    ...initialValues,
  }),
};

export const CostSheetSectionFactory = {
  create: (
    initialValues?: Partial<CostSheetSectionContract>
  ): CostSheetSectionContract => ({
    id: `section-${Math.random().toString(36).substring(2, 11)}`,
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
    id: `annex-${Math.random().toString(36).substring(2, 11)}`,
    title: '',
    columns: [],
    data: [],
    ...initialValues,
  }),
};

export const CostSheetDataFactory = {
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
