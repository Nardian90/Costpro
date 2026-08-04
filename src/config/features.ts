/**
 * Feature flags for CostPro.
 *
 * Centralized feature flag configuration. Flags default to `false` for
 * new features that are not yet production-ready. Toggle via environment
 * variables (NEXT_PUBLIC_ prefix for client-side access).
 *
 * Iteración 11.1: USE_V2_CHECKOUT is prepared but NOT activated.
 * The future /api/pos/checkout endpoint and create_sale_v2 RPC will be
 * gated behind this flag. When ready (Iteración 11.2), set to true.
 */

export const FEATURES = {
  /**
   * USE_V2_CHECKOUT — Gates the future checkout flow:
   *   - POST /api/pos/checkout endpoint
   *   - create_sale_v2 RPC (server-side recalculation of totals/discount/tax)
   *   - Server-side supervisor auth for discounts > 15%
   *
   * When false (current): POS uses the existing `create_sale` RPC directly
   * from the client via supabase.rpc(). This is the legacy path.
   *
   * When true (future Iteración 11.2): POS uses the new /api/pos/checkout
   * endpoint which wraps create_sale_v2 with server-side validation.
   *
   * To activate: set USE_V2_CHECKOUT=true in .env
   */
  USE_V2_CHECKOUT: process.env.NEXT_PUBLIC_USE_V2_CHECKOUT === 'true' || false,
} as const;

export type FeatureFlags = typeof FEATURES;
