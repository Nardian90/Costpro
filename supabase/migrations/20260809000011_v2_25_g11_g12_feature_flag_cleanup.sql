-- ══════════════════════════════════════════════════════════════════════
-- F-30 G11/G12 — Feature flag + Cleanup documentation
-- No SQL changes. Documenta el feature flag y el cleanup pendiente.
-- ══════════════════════════════════════════════════════════════════════

-- G11: Feature flag USE_V2_RECEIVED_SERVICES
--   Setear en .env: USE_V2_RECEIVED_SERVICES=true
--   Default: false (usa codigo TypeScript viejo)
--   Cuando true: API routes llaman a RPCs v2.25.0

-- G12: Cleanup pendiente (post-certificacion):
--   1. Eliminar v_dist_costs dead code de register_stock_movement
--   2. Eliminar codigo TypeScript viejo de postHandler/patchHandler cuando flag=true sea estable
--   3. Deprecar formalmente service_audit_log (los RPCs ya no escriben ahi)

COMMENT ON FUNCTION public.register_stock_movement(uuid, uuid, numeric, text, text, uuid, uuid, uuid, numeric, text, timestamp with time zone, boolean) IS
  'v2.25.0: v_dist_costs variable is dead code (calculated but never used). WAC is handled exclusively by trg_update_product_wac. Pending cleanup in next iteration.';
