-- =====================================================================
-- 20261020000002_sec_definer_hardening.sql — CP-SEC-027 Fase 7 (§3.4)
-- Endurecimiento de funciones SECURITY DEFINER (aplicación formal vía
-- Management API, autorizada por el propietario 2026-10-20, prompt v2 7.4):
--   (a) DROP de funciones E2E de borrado duro (2)
--   (a-trigger) REVOKE PUBLIC/anon a trigger protector (grants irrelevantes)
--   (b) RPCs de negocio: REVOKE PUBLIC/anon, MANTENER authenticated
--   (helpers) REVOKE PUBLIC/anon donde exista exposición anon (check1 ∩ expuestos)
-- CERO escrituras de datos. Solo DDL de privilegios. Transaccional.
-- clasificación completa: docs/audits/evidence/20261020-sec-definer-hardening/
-- =====================================================================
BEGIN;

-- §1 (a) Funciones E2E de borrado duro — DROP en producción
DROP FUNCTION IF EXISTS public.e2e_hard_delete_store(p_store_id uuid);
DROP FUNCTION IF EXISTS public.e2e_hard_delete_user(p_user_id uuid);

-- §2 Trigger protector (guard auth.uid interno; disparo NO depende de grants)
REVOKE EXECUTE ON FUNCTION public.profiles_block_privileged_update FROM PUBLIC, anon;

-- §3 (b) RPCs de negocio con grant explícito a authenticated: quitar anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.get_paginated_products_v2 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_products_for_pos FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_transactions FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_receipt_v2 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_pending_reception FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_with_access FROM PUBLIC, anon;

COMMIT;
