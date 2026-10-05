-- ============================================================================
-- FINALIZE-V2 — ELIMINACIÓN FÍSICA DE LAS FUNCIONES V1 DE VENTA/DEVOLUCIÓN
-- ============================================================================
-- Contrato canónico (FASE 3):
--   · VENTAS       → create_sale_v2 /24 (H0-R endurecido) — ÚNICO camino.
--   · DEVOLUCIONES → create_devolution_v2 /11 — ÚNICO camino.
--
-- Matriz de eliminación (verificación previa en LIVE + repo):
--
-- | Función            | Firmas | Callers DB (bodies) | Callers repo             | Acción  |
-- |--------------------|--------|---------------------|--------------------------|---------|
-- | create_sale        | /20    | 0 (solo comentarios en create_sale_v2 / get_transferable_stores / void_transaction) | ONLINE: useCreateSale (V1 path, ELIMINADO en esta rama); e2e security.spec (tests re-orientados a V2 + anti-resurrection) | DROP |
-- | create_devolution  | /10,/9 | 0 (comentarios en create_devolution_v2 / reverse_devolution) | devolutions route fallback (ELIMINADO en esta rama); scripts QA obsoletos (borrados) | DROP ×2 |
-- | fn_process_sale    | /3     | 0                   | 0                        | DROP |
-- | fn_process_receipt | /4,/3  | 0 (auto-referencias)| 0                        | DROP ×2 |
-- | reverse_adjustment | /3     | 0                   | 0 en src/ (solo scripts/test_reverse_e2e_full.mjs — QA obsoleto borrado) | DROP |
--
-- FUERA DE ALCANCE (funciones activas con callers reales — NO tocar):
--   void_transaction (useDocumentActions — path de anulación activo),
--   duplicate_inventory_adjustment (/api/inventory/adjustments/duplicate),
--   get_paginated_products (tienda pública + reports),
--   process_inventory_adjustment (/api/inventory/adjustments).
--
-- ACL colateral (higiene del contrato §12.3 — el censo LIVE mostró
-- void_transaction con EXECUTE implícito para PUBLIC, default de PostgreSQL):
--   REVOKE EXECUTE ... FROM PUBLIC, anon (se conservan authenticated +
--   service_role, ya presentes). void_transaction es una mutación sensible
--   (anula ventas + revierte comisiones) — el default PUBLIC es un residuo
--   del patrón pre-hardening, no un grant deliberado.
--
-- Anti-resurrección: los callers repo fueron eliminados en esta rama
-- (features.ts/USE_V2 flags, usePOSCheckout path V1, useCreateSale path
-- online, devolutions fallback, RPC_MAP_V1); e2e/security.spec.ts ahora
-- VERIFICA que create_sale responde 404 (gone) — la superficie retirada se
-- convierte en aserción de regresión.
-- ============================================================================

-- 1) Venta V1 (sustituida por create_sale_v2)
DROP FUNCTION IF EXISTS public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric, p_discount_type text, p_discount_value numeric,
  p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb,
  p_transaction_id uuid, p_operation_date timestamp with time zone,
  p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text,
  p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric,
  p_warehouse_id uuid, p_user_id uuid
);

-- 2) Devolución V1 — overload /10 (forma antigua con currency/exchange_rate)
DROP FUNCTION IF EXISTS public.create_devolution(
  p_store_id uuid, p_items jsonb, p_reason text,
  p_original_transaction_id uuid, p_payment_method text,
  p_customer_id uuid, p_customer_name text, p_notes text,
  p_currency text, p_exchange_rate numeric
);

-- 3) Devolución V1 — overload /9 (forma intermedia)
DROP FUNCTION IF EXISTS public.create_devolution(
  p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid,
  p_original_transaction_id uuid, p_payment_method text,
  p_customer_id uuid, p_customer_name text, p_notes text
);

-- 4) Motor de venta legacy (pre-V2)
DROP FUNCTION IF EXISTS public.fn_process_sale(
  p_items jsonb, p_cashier_id uuid, p_payment_method text
);

-- 5) Motor de recibo legacy — overload /4
DROP FUNCTION IF EXISTS public.fn_process_receipt(
  p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text
);

-- 6) Motor de recibo legacy — overload /3
DROP FUNCTION IF EXISTS public.fn_process_receipt(
  p_items jsonb, p_user_id uuid, p_reference text
);

-- 7) Reversal de ajuste V1 (sin callers en src/; V2 usa
--    reverse_inventory_adjustment_v2 vía /api/reverse)
DROP FUNCTION IF EXISTS public.reverse_adjustment(
  p_adjustment_id uuid, p_reason text, p_user_id uuid
);

-- 8) Higiene ACL: void_transaction conservado (activo) pero sin EXECUTE
--    implícito para PUBLIC/anon (patrón §12.3 — {authenticated, service_role}).
REVOKE EXECUTE ON FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text,
  p_operation_date timestamp with time zone, p_user_id uuid
) FROM PUBLIC, anon;

-- 9) Recarga del schema cache de PostgREST (canal estándar Supabase)
NOTIFY pgrst, 'reload schema';
