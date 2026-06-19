/**
 * @file Contrato de datos estricto para Ficha de Costo de Producto (ProductCostSheet).
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para la Ficha de Costo generada para un producto específico.
 * Este contrato es la vista compartida entre los bounded contexts
 * Inventory y CostManagement.
 *
 * NOTA: Los datos calculados (calculated_data) contienen el
 * CostSheetDataContract serializado como JSONB. El cost_price se
 * extrae como campo NUMERIC(12,2) para consultas rápidas y
 * ordenamiento sin deserializar el JSONB completo.
 */

import type { FCModalidad } from './store-cost-template';

// ============================================
// Sync Status para offline-first
// ============================================

export type CostSheetSyncStatus = 'pending' | 'synced' | 'conflict';

// ============================================
// ProductCostSheetContract — contrato estricto sin opcionales
// ============================================

export interface ProductCostSheetContract {
  id: string;
  product_id: string;
  store_id: string;
  template_id: string;
  modalidad: FCModalidad;
  calculated_data: Record<string, unknown>;  // CostSheetDataContract serializado
  cost_price: number;                        // NUMERIC(12,2) — costo unitario calculado
  cost_price_updated_at: string;
  sync_status: CostSheetSyncStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================
// ProductCostSheetFactory — fábrica con valores por defecto
// ============================================

export const ProductCostSheetFactory = {
  /**
   * Crea una FC de producto con valores por defecto seguros.
   * El campo cost_price se inicializa en 0 y debe ser calculado
   * por el motor de cálculo (cost-engine) antes de guardarse.
   */
  create: (initialValues?: Partial<ProductCostSheetContract>): ProductCostSheetContract => ({
    id: '',
    product_id: '',
    store_id: '',
    template_id: 'costpro-reinicio',
    modalidad: 'produccion',
    calculated_data: {},
    cost_price: 0,
    cost_price_updated_at: new Date().toISOString(),
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...initialValues,
  }),
};

// ============================================
// Raw type from DB (with optionals)
// ============================================

export interface ProductCostSheetRaw {
  id: string;
  product_id: string;
  store_id?: string | null;
  template_id?: string | null;
  modalidad?: string | null;
  calculated_data?: Record<string, unknown> | null;
  cost_price?: number | string | null;
  cost_price_updated_at?: string | null;
  sync_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

// ============================================
// mapProductCostSheetToContract — convierte raw → Contract
// ============================================

const VALID_MODALIDADES = ['produccion', 'servicios', 'comercializacion'] as const;
const VALID_SYNC_STATUS = ['pending', 'synced', 'conflict'] as const;

/**
 * Convierte el tipo raw de la BD (con campos opcionales) a
 * `ProductCostSheetContract` (con valores garantizados).
 * Convierte cost_price de string (NUMERIC de PostgreSQL) a number.
 */
export function mapProductCostSheetToContract(raw: ProductCostSheetRaw): ProductCostSheetContract {
  return ProductCostSheetFactory.create({
    id: raw.id,
    product_id: raw.product_id,
    store_id: raw.store_id ?? '',
    template_id: raw.template_id ?? 'costpro-reinicio',
    modalidad: (VALID_MODALIDADES.includes(raw.modalidad as typeof VALID_MODALIDADES[number])
      ? raw.modalidad as FCModalidad
      : 'produccion'),
    calculated_data: raw.calculated_data ?? {},
    cost_price: typeof raw.cost_price === 'string'
      ? parseFloat(raw.cost_price)
      : (raw.cost_price ?? 0),
    cost_price_updated_at: raw.cost_price_updated_at ?? new Date().toISOString(),
    sync_status: (VALID_SYNC_STATUS.includes(raw.sync_status as typeof VALID_SYNC_STATUS[number])
      ? raw.sync_status as CostSheetSyncStatus
      : 'pending'),
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
    deleted_at: raw.deleted_at ?? null,
  });
}

// ============================================
// Product FC Status (for UI badges)
// ============================================

export type ProductFCStatus = 'vigente' | 'pendiente' | 'sin_fc';

/**
 * Determina el estado de FC de un producto basado en sus datos.
 * - 'vigente': FC calculada con cost_price > 0 y sync_status = 'synced'
 * - 'pendiente': FC existe pero necesita datos o recálculo
 * - 'sin_fc': No tiene FC asociada
 */
export function getProductFCStatus(
  costSheetId: string | null | undefined,
  costPrice: number | null | undefined,
  syncStatus: CostSheetSyncStatus | null | undefined
): ProductFCStatus {
  if (!costSheetId) return 'sin_fc';
  if (syncStatus === 'conflict' || (costPrice !== null && costPrice !== undefined && costPrice === 0)) return 'pendiente';
  if (syncStatus === 'synced' && costPrice !== null && costPrice !== undefined && costPrice > 0) return 'vigente';
  return 'pendiente';
}
