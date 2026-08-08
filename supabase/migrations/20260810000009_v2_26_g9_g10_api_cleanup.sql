-- ══════════════════════════════════════════════════════════════════════
-- F-16 G10 — Cleanup documentation
-- Documentar dead code y deudas técnicas pendientes
-- ══════════════════════════════════════════════════════════════════════

-- Documentar v_dist_costs dead code en register_stock_movement
COMMENT ON FUNCTION public.register_stock_movement(uuid, uuid, numeric, text, text, uuid, uuid, uuid, numeric, text, timestamp with time zone, boolean) IS
  'v2.26.0: v_dist_costs variable is dead code (calculated but never used since v2.22.0 A2 hotfix). WAC is handled by trg_update_product_wac (receipt_items) and receive_production_output (production). Pending cleanup in next iteration.';

-- Documentar output_total_cost snapshot
COMMENT ON COLUMN public.production_orders.output_total_cost IS
  'v2.26.0 G1: Snapshot del costo total de materiales consumidos al recibir output. Congelado al ejecutar receive_production_output. Usado por void_closed_production_order y reverse_production_order para WAC reversal. NO recalcular desde production_order_items.';

-- Documentar idempotency_key
COMMENT ON COLUMN public.production_orders.idempotency_key IS
  'v2.26.0 G1: Clave de idempotencia para create_production_order_v2. Si se reutiliza con parámetros diferentes, lanza ERR_IDEMPOTENCY_KEY_REUSE.';

-- Documentar nueva función generate_production_order_number
COMMENT ON FUNCTION public.generate_production_order_number() IS
  'v2.26.0 G1: Usa nextval(production_order_number_seq) en vez de count+1. Elimina race condition. Formato: OP-YYYY-NNNNN.';
