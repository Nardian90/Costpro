/**
 * @file FC Generator Service — Motor de generación automática de Fichas de Costo
 * @description Orquesta la resolución de plantilla, cálculo y guardado de FC
 * para un producto. Este servicio es el puente entre:
 *
 *   - Integration Layer (fc-automation.ts) → resolución de plantilla
 *   - Cost Engine (cost-engine/) → cálculo puro
 *   - Supabase RPC → persistencia atómica
 *
 * SE USA DESDE:
 *   - API Routes (server-side)
 *   - No se usa directamente en el cliente (client usa las API routes)
 *
 * Resolución 148/2023 (MFP Cuba) — CostPro SaaS
 */

import { calculateFicha, validateFicha } from '@/lib/cost-engine';
import { buildEngineFicha } from '@/lib/cost-engine/build-ficha';
import type { CalculationResult, FichaJSON } from '@/lib/cost-engine/types';
import type { CostSheetData } from '@/types/cost-sheet';
import type { FCModalidad } from '@/contracts/store-cost-template';
import {
  resolveProductFC,
  shouldInvalidateFC,
  type FCProductInput,
  type FCStoreTemplateInput,
  type FCExistingCostSheetInput,
  type FCResolutionResult,
} from './fc-automation';

// ============================================
// Template Registry — Mapa de template_id → data
// ============================================

/**
 * Registro estático de plantillas del sistema.
 * Las plantillas se cargan dinámicamente para evitar
 * importar 500KB+ de JSON en cada request.
 */
const TEMPLATE_REGISTRY: Record<string, () => Promise<CostSheetData>> = {
  'costpro-reinicio': () => import('@/lib/data/costpro-reinicio').then(m => m.default),
  'template-pizza': () => import('@/lib/data/template-pizza').then(m => m.default),
  'template-juice': () => import('@/lib/data/template-juice').then(m => m.default),
  'template-icecream': () => import('@/lib/data/template-icecream').then(m => m.default),
  'template-shoes': () => import('@/lib/data/template-shoes').then(m => m.default),
  'template-furniture': () => import('@/lib/data/template-furniture').then(m => m.default),
  'template-repair': () => import('@/lib/data/template-repair').then(m => m.default),
  'template-consultancy': () => import('@/lib/data/template-consultancy').then(m => m.default),
  'template-logistics': () => import('@/lib/data/template-logistics').then(m => m.default),
  'template-industrial': () => import('@/lib/data/template-industrial').then(m => m.default),
  'template-lavar': () => import('@/lib/data/template-lavar').then(m => m.default),
  'template-pastry': () => import('@/lib/data/template-pastry').then(m => m.default),
  'costpro-ejemplo': () => import('@/lib/data/costpro-ejemplo').then(m => m.default),
};

/** Alias mapping: template explorer IDs → data file IDs */
const TEMPLATE_ALIAS: Record<string, string> = {
  'sys-reinicio': 'costpro-reinicio',
  'sys-pizza': 'template-pizza',
  'sys-juice': 'template-juice',
  'sys-icecream': 'template-icecream',
  'sys-shoes': 'template-shoes',
  'sys-furniture': 'template-furniture',
  'sys-repair': 'template-repair',
  'sys-consultancy': 'template-consultancy',
  'sys-logistics': 'template-logistics',
  'sys-industrial': 'template-industrial',
  'sys-lavar': 'template-lavar',
  'sys-pastry': 'template-pastry',
  'sys-ejemplo': 'costpro-ejemplo',
};

/**
 * Obtiene los datos de una plantilla por su ID.
 * Resuelve alias (sys-pizza → template-pizza) y carga
 * dinámicamente el módulo correspondiente.
 */
export async function getTemplateData(templateId: string): Promise<CostSheetData | null> {
  const resolvedId = TEMPLATE_ALIAS[templateId] || templateId;
  const loader = TEMPLATE_REGISTRY[resolvedId];
  if (!loader) return null;
  try {
    return await loader();
  } catch (error) {
    console.error(`[FCGenerator] Error cargando plantilla "${resolvedId}":`, error);
    return null;
  }
}

/**
 * Lista todos los IDs de plantillas disponibles en el sistema.
 */
export function getAvailableTemplateIds(): string[] {
  return [...Object.keys(TEMPLATE_ALIAS), ...Object.keys(TEMPLATE_REGISTRY)];
}

// ============================================
// Product Data Injection — Inyecta datos del producto en la plantilla
// ============================================

export interface ProductDataForFC {
  name: string;
  sku?: string | null;
  cost_price: number;
  price: number;
  unit_of_measure?: string | null;
  category?: string | null;
  quantity?: number;
}

/**
 * Inyecta los datos del producto en la plantilla de FC.
 * Modifica el header y el Anexo I con los datos del producto,
 * dejando las fórmulas intactas para que el motor de cálculo
 * las resuelva.
 */
export function injectProductIntoTemplate(
  templateData: CostSheetData,
  product: ProductDataForFC,
  modalidad: FCModalidad,
): CostSheetData {
  const data = JSON.parse(JSON.stringify(templateData)) as CostSheetData;

  // Update header with product info
  if (data.header) {
    data.header.name = product.name;
    data.header.product_code = product.sku || '';
    data.header.sale_price = product.price;
    data.header.quantity = product.quantity || 1;
    if (product.category) {
      data.header.category = product.category;
    }
    // Set destination based on modalidad
    data.header.destination = modalidad;
  }

  // Inject product as first row in Anexo I (raw materials)
  if (data.annexes && data.annexes.length > 0) {
    const anexoI = data.annexes.find(a => a.id === 'I' || a.id === '1');
    if (anexoI) {
      const productRow = {
        classification: '1.1.1 - De ello: - Insumos (MP)',
        code: product.sku || '',
        description: product.name,
        um: product.unit_of_measure || 'u',
        consumption_norm: product.quantity || 1,
        price: product.cost_price,
        price_total: product.cost_price * (product.quantity || 1),
        total: product.cost_price * (product.quantity || 1),
        amount: product.cost_price * (product.quantity || 1),
      };

      // Replace first row or prepend
      if (anexoI.data && anexoI.data.length > 0) {
        // Keep existing rows but add product as first entry
        anexoI.data = [productRow, ...anexoI.data];
      } else {
        anexoI.data = [productRow];
      }
    }
  }

  return data;
}

// ============================================
// FC Generation Result
// ============================================

export interface FCGenerationResult {
  success: boolean;
  cost_price: number;
  sale_price: number;
  total_cost: number;
  total_margin: number;
  total_tax: number;
  grand_total: number;
  calculated_data: Record<string, unknown>;
  validation_errors: string[];
  elapsed_ms: number;
  template_id: string;
  modalidad: FCModalidad;
}

export interface FCGenerationError {
  success: false;
  error: string;
  code: 'NO_TEMPLATE' | 'TEMPLATE_LOAD_FAILED' | 'CALCULATION_FAILED' | 'VALIDATION_FAILED' | 'SAVE_FAILED';
  details?: string;
}

// ============================================
// FC Generator — Main Service
// ============================================

/**
 * Genera la Ficha de Costo para un producto usando la plantilla
 * de la tienda. Pipeline completo:
 *
 * 1. Resolver plantilla (store template → template data)
 * 2. Inyectar datos del producto en la plantilla
 * 3. Construir FichaJSON para el motor de cálculo
 * 4. Calcular FC con el cost-engine
 * 5. Extraer resultados (cost_price, sale_price, etc.)
 *
 * NOTA: Esta función NO guarda en BD. El guardado se hace
 * vía POST /api/product-cost-sheets usando la RPC atómica.
 */
export async function generateFC(
  product: ProductDataForFC,
  templateId: string,
  modalidad: FCModalidad,
  templateOverride?: Record<string, unknown> | null,
): Promise<FCGenerationResult | FCGenerationError> {
  // 1. Load template data
  let templateData = await getTemplateData(templateId);
  if (!templateData) {
    return {
      success: false,
      error: `Plantilla "${templateId}" no encontrada`,
      code: 'TEMPLATE_LOAD_FAILED',
    };
  }

  // 2. Apply custom override if provided (store-level customizations)
  if (templateOverride && typeof templateOverride === 'object') {
    try {
      const overrideData = templateOverride as CostSheetData;
      // Merge: override sections/annexes take precedence
      templateData = {
        ...templateData,
        ...overrideData,
        header: { ...templateData.header, ...overrideData.header },
      };
    } catch {
      // If override fails, use base template
      console.warn('[FCGenerator] template_override inválido, usando plantilla base');
    }
  }

  // 3. Inject product data into template
  const enrichedTemplate = injectProductIntoTemplate(templateData, product, modalidad);

  // 4. Build engine-ready FichaJSON
  let ficha: FichaJSON;
  try {
    ficha = buildEngineFicha(enrichedTemplate);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error construyendo FichaJSON';
    return {
      success: false,
      error: msg,
      code: 'CALCULATION_FAILED',
      details: 'buildEngineFicha failed',
    };
  }

  // 5. Pre-validate
  const validation = validateFicha(ficha);
  if (!validation.valid && validation.validationErrors.some(e => e.type === 'CRITICAL')) {
    return {
      success: false,
      error: 'Validación crítica fallida',
      code: 'VALIDATION_FAILED',
      details: validation.validationErrors
        .filter(e => e.type === 'CRITICAL')
        .map(e => e.message)
        .join('; '),
    };
  }

  // 6. Calculate
  let result: CalculationResult;
  try {
    result = calculateFicha(ficha, { actor: 'fc-automation' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error en el cálculo';
    return {
      success: false,
      error: msg,
      code: 'CALCULATION_FAILED',
    };
  }

  // 7. Extract and return results
  const { summary } = result;
  const calculatedData = {
    header: enrichedTemplate.header,
    sections: enrichedTemplate.sections,
    annexes: enrichedTemplate.annexes,
    calculatedRows: result.rows.map(r => ({
      id: r.id,
      classification: r.classification,
      label: r.label,
      total: r.total,
      calculatedVH: r.calculatedVH,
      type: r.type,
    })),
    summary: result.summary,
    audits: result.audits.slice(0, 50), // Limit audit entries
  };

  return {
    success: true,
    cost_price: summary.totalCost,
    sale_price: summary.grandTotal,
    total_cost: summary.totalCost,
    total_margin: summary.totalMargin,
    total_tax: summary.totalTax,
    grand_total: summary.grandTotal,
    calculated_data: calculatedData,
    validation_errors: result.validationErrors || [],
    elapsed_ms: result.elapsedMs,
    template_id: templateId,
    modalidad,
  };
}

// ============================================
// Auto-generate FC for a product (full pipeline)
// ============================================

export interface AutoGenerateParams {
  product: ProductDataForFC;
  product_id: string;
  store_id: string;
  storeTemplate: FCStoreTemplateInput;
  existingCostSheet?: FCExistingCostSheetInput | null;
  fc_auto_enabled?: boolean;
}

/**
 * Pipeline completo: resolver → generar → retornar datos para guardar.
 * El guardado en BD se delega al caller (API route) para mantener
 * la separación de responsabilidades.
 *
 * Retorna los datos listos para enviar a save_product_cost_sheet RPC.
 */
export async function autoGenerateFC(
  params: AutoGenerateParams,
): Promise<FCGenerationResult | FCGenerationError> {
  const { product, product_id, store_id, storeTemplate, existingCostSheet, fc_auto_enabled } = params;

  // Check if FC is disabled for this product
  if (fc_auto_enabled === false) {
    return {
      success: false,
      error: 'FC automática deshabilitada para este producto',
      code: 'CALCULATION_FAILED',
    };
  }

  // If product already has a valid FC, check if recalculation is needed
  if (existingCostSheet && !existingCostSheet.deleted_at) {
    const needsRecalc = existingCostSheet.sync_status === 'conflict' ||
      existingCostSheet.cost_price === 0;

    if (!needsRecalc) {
      // FC is valid, no need to recalculate
      return {
        success: true,
        cost_price: existingCostSheet.cost_price,
        sale_price: 0, // Not stored separately
        total_cost: existingCostSheet.cost_price,
        total_margin: 0,
        total_tax: 0,
        grand_total: 0,
        calculated_data: existingCostSheet.calculated_data as Record<string, unknown>,
        validation_errors: [],
        elapsed_ms: 0,
        template_id: existingCostSheet.template_id,
        modalidad: existingCostSheet.modalidad,
      };
    }
  }

  // Generate new FC using store template
  return generateFC(
    product,
    storeTemplate.template_id,
    storeTemplate.modalidad,
    storeTemplate.template_data,
  );
}

// ============================================
// Supabase Admin Client Helper
// ============================================

// Re-export from centralized module for backward compatibility
export { getAdminClient } from '@/lib/supabase-admin';
