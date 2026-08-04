/**
 * Feature flags for CostPro.
 *
 * Centralized feature flag configuration. Flags default to `false` for
 * new features that are not yet production-ready. Toggle via environment
 * variables (NEXT_PUBLIC_ prefix for client-side access).
 *
 * Iteración 11.2: USE_V2_CHECKOUT + pilot stores support.
 */

export const FEATURES = {
  /**
   * USE_V2_CHECKOUT — Gates the new checkout flow:
   *   - POST /api/pos/checkout endpoint
   *   - create_sale_v2 RPC (server-side recalculation of totals/discount/tax)
   *   - Server-side supervisor auth for discounts > 15%
   *
   * When false: POS uses the existing `create_sale` RPC directly from the client.
   * When true: POS uses the new /api/pos/checkout endpoint.
   *
   * To activate: set NEXT_PUBLIC_USE_V2_CHECKOUT=true in .env
   */
  USE_V2_CHECKOUT: process.env.NEXT_PUBLIC_USE_V2_CHECKOUT === 'true' || false,

  /**
   * V2_CHECKOUT_PILOT_STORES — Comma-separated list of store IDs that use v2.
   * If empty, all stores use v2 when USE_V2_CHECKOUT=true.
   * If non-empty, only listed stores use v2 (pilot phase).
   *
   * Example: "uuid1,uuid2,uuid3"
   */
  V2_CHECKOUT_PILOT_STORES: (process.env.NEXT_PUBLIC_V2_CHECKOUT_PILOT_STORES || '')
    .split(',')
    .filter(Boolean),
} as const;

export type FeatureFlags = typeof FEATURES;

/**
 * Helper: determines if a specific store should use the v2 checkout flow.
 * - If USE_V2_CHECKOUT is false → always false
 * - If pilot stores list is empty → true for all stores
 * - If pilot stores list is non-empty → true only for listed stores
 */
export function shouldUseV2Checkout(storeId: string | undefined | null): boolean {
  if (!FEATURES.USE_V2_CHECKOUT) return false;
  if (FEATURES.V2_CHECKOUT_PILOT_STORES.length === 0) return true; // all stores
  return !!storeId && FEATURES.V2_CHECKOUT_PILOT_STORES.includes(storeId);
}
