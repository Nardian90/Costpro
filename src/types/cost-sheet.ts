/**
 * @file Tipos para la Ficha de Costo.
 * @deprecated Use `src/contracts/cost-sheet.ts` para nuevos desarrollos.
 * Esta interfaz se mantiene por compatibilidad mientras se completa la migración al Contrato Hardened.
 */

import {
  CostSheetHeaderContract,
  CostSheetRowContract,
  CostSheetSectionContract,
  CostSheetColumnContract,
  CostSheetAnnexContract,
  CostSheetSignatureContract,
  CostSheetDataContract
} from '@/contracts/cost-sheet';

export type CostSheetHeader = CostSheetHeaderContract;
export type CostSheetRow = CostSheetRowContract;
export type CostSheetSection = CostSheetSectionContract;
export type CostSheetColumn = CostSheetColumnContract;
export type CostSheetAnnex = CostSheetAnnexContract;
export type CostSheetSignature = CostSheetSignatureContract;
export type CostSheetData = CostSheetDataContract;

export interface CalculatedRowValue {
  valor_historico: number;
  base_ref: string | null;
  baseTotal: number;
  baseValorHistorico: number;
  coeficiente: number;
  total: number;
  audits?: any[];
  hasWarnings?: boolean;
  validationErrors?: { message: string, type: 'CRITICAL' | 'WARNING', code: string }[];
  // Fallbacks for legacy compatibility during transition
  /** @deprecated */
  valorHistorico?: number;
  /** @deprecated */
  baseDeCalculoRef?: string | null;
}
