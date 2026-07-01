/**
 * @file Capa de Integración — FC Automatizada por Tienda
 * @description Mediador entre los bounded contexts de Inventario (productos)
 * y CostManagement (fichas de costo). Este módulo orquesta la resolución
 * de FC para un producto aplicando la cadena de fallback:
 *
 *   1. FC explícita del producto (product.cost_sheet_id)
 *   2. Plantilla por defecto de la tienda (store_cost_templates)
 *   3. Error: tienda sin plantilla configurada
 *
 * NINGÚN bounded context importa al otro directamente. Toda la
 * coordinación pasa por este módulo de integración.
 *
 * Resolución 148/2023 (MFP Cuba) — CostPro SaaS
 */

import type { FCModalidad, FCPdfFormat } from '@/contracts/store-cost-template';
import type {
  ProductCostSheetContract,
  CostSheetSyncStatus,
  ProductFCStatus,
} from '@/contracts/product-cost-sheet';
import { getProductFCStatus } from '@/contracts/product-cost-sheet';

// ============================================
// Tipos de resultado de resolución
// ============================================

/** FC ya existe y está vigente */
export interface FCResolvedExisting {
  status: 'existing';
  costSheet: ProductCostSheetContract;
  fc_status: ProductFCStatus;
}

/** FC no existe; se resolvió la plantilla a aplicar */
export interface FCResolvedTemplate {
  status: 'needs_calculation';
  product_id: string;
  store_id: string;
  template_id: string;
  template_data: Record<string, unknown> | null;
  modalidad: FCModalidad;
  pdf_format: FCPdfFormat;
  fc_status: 'pendiente';
}

/** La tienda no tiene plantilla configurada */
export interface FCResolvedNoTemplate {
  status: 'no_template';
  product_id: string;
  store_id: string;
  fc_status: 'sin_fc';
  message: string;
}

/** Producto sin FC automática (fc_auto_enabled = false) */
export interface FCResolvedDisabled {
  status: 'disabled';
  product_id: string;
  store_id: string;
  fc_status: 'sin_fc';
  message: string;
}

export type FCResolutionResult =
  | FCResolvedExisting
  | FCResolvedTemplate
  | FCResolvedNoTemplate
  | FCResolvedDisabled;

// ============================================
// Producto mínimo para resolución
// ============================================

export interface FCProductInput {
  id: string;
  store_id: string | null;
  cost_sheet_id: string | null;
  fc_auto_enabled: boolean;
  cost_price: number;
  name?: string;
}

// ============================================
// Plantilla de tienda mínima para resolución
// ============================================

export interface FCStoreTemplateInput {
  template_id: string;
  template_data: Record<string, unknown> | null;
  modalidad: FCModalidad;
  pdf_format: FCPdfFormat;
  is_active: boolean;
}

// ============================================
// FC de producto existente para resolución
// ============================================

export interface FCExistingCostSheetInput {
  id: string;
  product_id: string;
  store_id: string;
  template_id: string;
  modalidad: FCModalidad;
  calculated_data: Record<string, unknown>;
  cost_price: number;
  cost_price_updated_at: string;
  sync_status: CostSheetSyncStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================
// Resolución de FC — Motor principal
// ============================================

/**
 * Resuelve la Ficha de Costo para un producto aplicando la cadena de fallback.
 *
 * Flujo:
 * 1. Si fc_auto_enabled = false → FCResolvedDisabled
 * 2. Si cost_sheet_id existe → FCResolvedExisting (con fc_status calculado)
 * 3. Si la tienda tiene plantilla → FCResolvedTemplate
 * 4. Si no hay plantilla → FCResolvedNoTemplate
 *
 * @param product — Datos mínimos del producto
 * @param costSheet — FC existente del producto (null si no tiene)
 * @param storeTemplate — Plantilla de la tienda (null si no tiene)
 * @returns Resultado de la resolución
 */
export function resolveProductFC(
  product: FCProductInput,
  costSheet: FCExistingCostSheetInput | null,
  storeTemplate: FCStoreTemplateInput | null,
): FCResolutionResult {
  // 1. FC deshabilitada para este producto
  if (!product.fc_auto_enabled) {
    return {
      status: 'disabled',
      product_id: product.id,
      store_id: product.store_id ?? '',
      fc_status: 'sin_fc',
      message: 'La generación automática de FC está deshabilitada para este producto.',
    };
  }

  // 2. FC existente y no eliminada
  if (product.cost_sheet_id && costSheet && !costSheet.deleted_at) {
    const fcStatus = getProductFCStatus(
      product.cost_sheet_id,
      costSheet.cost_price,
      costSheet.sync_status,
    );
    return {
      status: 'existing',
      costSheet,
      fc_status: fcStatus,
    };
  }

  // 3. Sin tienda asignada — no se puede resolver plantilla
  if (!product.store_id) {
    return {
      status: 'no_template',
      product_id: product.id,
      store_id: '',
      fc_status: 'sin_fc',
      message: 'El producto no tiene tienda asignada. No se puede resolver la FC.',
    };
  }

  // 4. La tienda tiene plantilla activa → necesita cálculo
  if (storeTemplate && storeTemplate.is_active) {
    return {
      status: 'needs_calculation',
      product_id: product.id,
      store_id: product.store_id,
      template_id: storeTemplate.template_id,
      template_data: storeTemplate.template_data,
      modalidad: storeTemplate.modalidad,
      pdf_format: storeTemplate.pdf_format,
      fc_status: 'pendiente',
    };
  }

  // 5. Sin plantilla en la tienda
  return {
    status: 'no_template',
    product_id: product.id,
    store_id: product.store_id,
    fc_status: 'sin_fc',
    message: 'Esta tienda no tiene plantilla de FC asignada. Configure una plantilla predeterminada primero.',
  };
}

// ============================================
// Invalidation Events — Para caché de PDF
// ============================================

export type FCInvalidationReason =
  | 'cost_price_changed'
  | 'template_changed'
  | 'product_updated'
  | 'store_template_changed'
  | 'manual_invalidation';

export interface FCInvalidationEvent {
  product_id: string;
  store_id: string;
  reason: FCInvalidationReason;
  timestamp: string;
  previous_cost_price?: number;
  new_cost_price?: number;
}

/**
 * Determina si un cambio en el producto requiere invalidar la FC cacheada.
 * Regla: Si el cost_price cambió, la FC debe recalcularse.
 */
export function shouldInvalidateFC(
  previousProduct: { cost_price: number },
  updatedProduct: { cost_price: number },
): boolean {
  return previousProduct.cost_price !== updatedProduct.cost_price;
}

/**
 * Genera un evento de invalidación de FC.
 */
export function createInvalidationEvent(
  productId: string,
  storeId: string,
  reason: FCInvalidationReason,
  previousCostPrice?: number,
  newCostPrice?: number,
): FCInvalidationEvent {
  return {
    product_id: productId,
    store_id: storeId,
    reason,
    timestamp: new Date().toISOString(),
    previous_cost_price: previousCostPrice,
    new_cost_price: newCostPrice,
  };
}

// ============================================
// Helpers para el frontend
// ============================================

/**
 * Genera la URL de descarga rápida de PDF para la FC de un producto.
 * Esta URL apunta al endpoint de exportación de FC.
 */
export function getQuickPdfUrl(
  productId: string,
  storeId: string,
  pdfFormat: FCPdfFormat = 'res148',
): string {
  const params = new URLSearchParams({
    product_id: productId,
    store_id: storeId,
    pdf_format: pdfFormat,
  });
  // FIX-FC-PDF-URL: Use quick-pdf (GET) not export-pdf (POST)
  return `/api/product-cost-sheets/quick-pdf?${params.toString()}`;
}

/**
 * Determina el badge visual de FC para la UI del inventario.
 */
export function getFCStatusBadge(
  fcStatus: ProductFCStatus,
): { label: string; color: 'green' | 'yellow' | 'gray' } {
  switch (fcStatus) {
    case 'vigente':
      return { label: 'FC Vigente', color: 'green' };
    case 'pendiente':
      return { label: 'FC Pendiente', color: 'yellow' };
    case 'sin_fc':
      return { label: 'Sin FC', color: 'gray' };
  }
}

/**
 * Cuenta cuántos productos de una lista tienen FC vigente, pendiente o sin FC.
 * Útil para dashboard de cobertura FC.
 */
export function calculateFCCoverage(
  products: Array<{ cost_sheet_id: string | null; fc_auto_enabled: boolean; cost_price: number }>,
  costSheets: Map<string, { sync_status: CostSheetSyncStatus; cost_price: number }>,
): { vigente: number; pendiente: number; sin_fc: number; total: number; coverage: number } {
  let vigente = 0;
  let pendiente = 0;
  let sinFc = 0;

  for (const product of products) {
    if (!product.fc_auto_enabled) {
      sinFc++;
      continue;
    }

    if (!product.cost_sheet_id) {
      sinFc++;
      continue;
    }

    const cs = costSheets.get(product.cost_sheet_id);
    if (!cs) {
      sinFc++;
      continue;
    }

    const status = getProductFCStatus(product.cost_sheet_id, cs.cost_price, cs.sync_status);
    if (status === 'vigente') vigente++;
    else if (status === 'pendiente') pendiente++;
    else sinFc++;
  }

  const total = products.length;
  const coverage = total > 0 ? (vigente / total) * 100 : 0;

  return { vigente, pendiente, sin_fc: sinFc, total, coverage: Math.round(coverage * 100) / 100 };
}
