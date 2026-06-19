/**
 * @file Recalculate On Price Change — Standalone service for price-change→FC recalculation
 * @description Extracts the price-change→FC recalculation logic that was previously
 * embedded in useProducts.ts. Can be called from:
 *   - API routes (server-side)
 *   - Batch operations
 *   - Webhook handlers
 *
 * This service:
 *   1. Evaluates whether a price change requires FC recalculation via shouldInvalidateFC
 *   2. Creates an invalidation event for audit trail
 *   3. Triggers FC auto-generation via autoGenerateFC
 *   4. Persists the result via save_product_cost_sheet RPC
 *
 * Resolución 148/2023 (MFP Cuba) — CostPro SaaS
 */

import { getAdminClient } from '@/lib/supabase-admin';
import { autoGenerateFC } from './fc-generator-service';
import {
  shouldInvalidateFC,
  createInvalidationEvent,
  type FCInvalidationEvent,
  type FCInvalidationReason,
} from './fc-automation';

// ============================================
// Public Types
// ============================================

export interface PriceChangeRecord {
  productId: string;
  storeId: string;
  oldCostPrice: number;
  newCostPrice: number;
  changedBy: string;
  /** Skip shouldInvalidateFC check and force recalculation.
   *  Use when the caller already knows the price changed
   *  (e.g. from a product update mutation where cost_price was in the payload). */
  forceRecalculation?: boolean;
}

export interface RecalculationResult {
  productId: string;
  recalculationNeeded: boolean;
  success: boolean;
  error?: string;
  newCostPrice?: number;
  invalidationEvent?: FCInvalidationEvent;
}

// ============================================
// Core Service
// ============================================

/**
 * Evaluates whether a price change requires FC recalculation
 * and triggers it if needed.
 *
 * @param change - The price change record with old/new cost prices
 * @returns RecalculationResult indicating whether recalculation was needed and its outcome
 */
export async function recalculateOnPriceChange(
  change: PriceChangeRecord,
): Promise<RecalculationResult> {
  // 1. Check if recalculation is needed via shouldInvalidateFC
  //    Skip check when forceRecalculation is true (caller already knows price changed)
  if (
    !change.forceRecalculation &&
    !shouldInvalidateFC(
      { cost_price: change.oldCostPrice },
      { cost_price: change.newCostPrice },
    )
  ) {
    return {
      productId: change.productId,
      recalculationNeeded: false,
      success: true,
    };
  }

  // 2. Create invalidation event for audit trail
  const invalidationEvent = createInvalidationEvent(
    change.productId,
    change.storeId,
    'cost_price_changed' as FCInvalidationReason,
    change.oldCostPrice,
    change.newCostPrice,
  );

  // 3. Trigger FC auto-generation
  try {
    const admin = await getAdminClient();

    // Fetch product details
    const { data: product } = await admin
      .from('products')
      .select('*')
      .eq('id', change.productId)
      .single();

    if (!product) {
      return {
        productId: change.productId,
        recalculationNeeded: true,
        success: false,
        error: 'Product not found',
        invalidationEvent,
      };
    }

    // Fetch store template
    const { data: template } = await admin
      .from('store_cost_templates')
      .select('*')
      .eq('store_id', change.storeId)
      .eq('is_active', true)
      .maybeSingle();

    if (!template) {
      return {
        productId: change.productId,
        recalculationNeeded: true,
        success: false,
        error: 'No active store template',
        invalidationEvent,
      };
    }

    // Fetch existing cost sheet if any
    const { data: existingSheet } = await admin
      .from('product_cost_sheets')
      .select('*')
      .eq('product_id', change.productId)
      .eq('store_id', change.storeId)
      .maybeSingle();

    // Generate FC
    const result = await autoGenerateFC({
      product,
      product_id: change.productId,
      store_id: change.storeId,
      storeTemplate: template,
      existingCostSheet: existingSheet ?? null,
      fc_auto_enabled: product.fc_auto_enabled,
    });

    if (!result.success || 'error' in result) {
      return {
        productId: change.productId,
        recalculationNeeded: true,
        success: false,
        error: ('error' in result ? result.error : null) || 'FC generation failed',
        invalidationEvent,
      };
    }

    // Save directly (FIX-FC-PERSIST-V3: RPC save_product_cost_sheet fails with service role key
    // because it uses is_global_admin()/has_store_role() which rely on auth.uid().
    // Use check-then-insert/update pattern since partial unique index prevents upsert.)

    const { data: existingCS } = await admin
      .from('product_cost_sheets')
      .select('id')
      .eq('product_id', change.productId)
      .is('deleted_at', null)
      .maybeSingle();

    let csId: string | null = null;

    if (existingCS) {
      const { data, error: updateErr } = await admin
        .from('product_cost_sheets')
        .update({
          template_id: result.template_id,
          modalidad: result.modalidad,
          calculated_data: result.calculated_data,
          cost_price: result.cost_price,
          sync_status: 'synced',
        })
        .eq('id', existingCS.id)
        .select('id')
        .single();

      if (updateErr) {
        return {
          productId: change.productId,
          recalculationNeeded: true,
          success: false,
          error: updateErr.message,
          invalidationEvent,
        };
      }
      csId = data?.id ?? null;
    } else {
      const { data, error: insertErr } = await admin
        .from('product_cost_sheets')
        .insert({
          product_id: change.productId,
          store_id: change.storeId,
          template_id: result.template_id,
          modalidad: result.modalidad,
          calculated_data: result.calculated_data,
          cost_price: result.cost_price,
          sync_status: 'synced',
        })
        .select('id')
        .single();

      if (insertErr) {
        return {
          productId: change.productId,
          recalculationNeeded: true,
          success: false,
          error: insertErr.message,
          invalidationEvent,
        };
      }
      csId = data?.id ?? null;
    }

    // Link product to cost sheet
    if (csId) {
      await admin
        .from('products')
        .update({ cost_sheet_id: csId })
        .eq('id', change.productId);
    }

    return {
      productId: change.productId,
      recalculationNeeded: true,
      success: true,
      newCostPrice: result.cost_price,
      invalidationEvent,
    };
  } catch (err) {
    return {
      productId: change.productId,
      recalculationNeeded: true,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      invalidationEvent,
    };
  }
}

/**
 * Batch recalculation for bulk price updates.
 * Processes all changes concurrently via Promise.all.
 *
 * @param changes - Array of price change records
 * @returns Array of RecalculationResult for each change
 */
export async function batchRecalculateOnPriceChange(
  changes: PriceChangeRecord[],
): Promise<RecalculationResult[]> {
  return Promise.all(changes.map((change) => recalculateOnPriceChange(change)));
}
