'use client';

/**
 * @file useFCPriceSync — Monitors cost_price changes and automatically
 * triggers FC recalculation when a mismatch is detected.
 *
 * @description This hook watches the FC status for a product and
 * automatically triggers recalculation when:
 *   1. FC status is 'pendiente' (needs calculation)
 *   2. The product's current cost_price differs from the cost_sheet's
 *      stored cost_price (indicating a price update that hasn't been
 *      reflected in the FC yet)
 *
 * Auto-sync is debounced (500ms) and rate-limited to no more than once
 * per 10 seconds to avoid excessive API calls.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  useProductCostSheet,
  useAutoGenerateFC,
} from './useProductCostSheet';
import type { ProductFCStatus } from '@/contracts/product-cost-sheet';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 500;
const MIN_INTERVAL_MS = 10_000; // 10 seconds between auto-syncs

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FCPriceSyncResult {
  /** True while an automatic sync is in progress */
  isSyncing: boolean;
  /** Error from the last sync attempt, if any */
  syncError: Error | null;
  /** ISO timestamp of the last successful sync */
  lastSyncAt: string | null;
  /** Manually trigger a recalculation */
  manualSync: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useFCPriceSync — Monitors cost_price changes and auto-triggers FC recalculation.
 *
 * @param productId       - The product to monitor
 * @param storeId         - The store context
 * @param currentCostPrice - The product's current cost_price (from the product record)
 */
export function useFCPriceSync(
  productId: string,
  storeId: string,
  currentCostPrice: number,
): FCPriceSyncResult {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // ── Refs for debounce / rate-limit ─────────────────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // ── FC data hook ───────────────────────────────────────────────────────────
  const { data: fcData, fcStatus, isLoading } = useProductCostSheet(productId, storeId);

  // ── Auto-generate mutation ─────────────────────────────────────────────────
  const autoGenerateMutation = useAutoGenerateFC();

  // ── Sync logic ─────────────────────────────────────────────────────────────

  /**
   * Triggers FC recalculation. Respects the 10-second minimum interval
   * between automatic syncs but can be forced via manualSync().
   */
  const triggerSync = useCallback(
    (isManual: boolean = false) => {
      // Rate-limit check (skip for manual triggers)
      const now = Date.now();
      if (!isManual && now - lastSyncTimeRef.current < MIN_INTERVAL_MS) {
        return;
      }

      setIsSyncing(true);
      setSyncError(null);

      autoGenerateMutation.mutate(
        { product_id: productId, store_id: storeId },
        {
          onSuccess: () => {
            if (isMountedRef.current) {
              lastSyncTimeRef.current = Date.now();
              setLastSyncAt(new Date().toISOString());
              setIsSyncing(false);
              setSyncError(null);
            }
          },
          onError: (error: Error) => {
            if (isMountedRef.current) {
              setIsSyncing(false);
              setSyncError(error);
            }
          },
          onSettled: () => {
            if (isMountedRef.current) {
              setIsSyncing(false);
            }
          },
        },
      );
    },
    [autoGenerateMutation, productId, storeId],
  );

  /**
   * Manual sync — bypasses debounce and rate-limit.
   */
  const manualSync = useCallback(() => {
    // Clear any pending debounced auto-sync
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Reset rate-limit so manual sync always works
    lastSyncTimeRef.current = 0;
    triggerSync(true);
  }, [triggerSync]);

  // ── Auto-sync effect ───────────────────────────────────────────────────────

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Don't auto-sync if:
    // - FC data is still loading
    // - A sync is already in progress
    if (isLoading || isSyncing) return;

    // Determine if auto-sync is needed
    let needsSync = false;

    // Condition 1: FC status is 'pendiente'
    if (fcStatus === 'pendiente') {
      needsSync = true;
    }

    // Condition 2: Cost price mismatch (product cost_price != cost_sheet cost_price)
    if (fcData && fcData.cost_price !== undefined && fcData.cost_price !== null) {
      const sheetCostPrice = fcData.cost_price;
      // Use a small epsilon for floating-point comparison
      if (Math.abs(sheetCostPrice - currentCostPrice) > 0.005) {
        needsSync = true;
      }
    }

    if (!needsSync) return;

    // Debounce: clear any existing timer and set a new one
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        triggerSync(false);
      }
    }, DEBOUNCE_MS);

    // Cleanup on dependency change
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [fcStatus, fcData, currentCostPrice, isLoading, isSyncing, triggerSync]);

  return {
    isSyncing,
    syncError,
    lastSyncAt,
    manualSync,
  };
}
