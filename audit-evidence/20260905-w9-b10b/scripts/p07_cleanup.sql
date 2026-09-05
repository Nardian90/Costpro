-- ═══════════════════════════════════════════════════════════════════
-- B-10b · p07_cleanup.sql — limpieza total del fixture (0 residuos)
-- Modo réplica: bypass de triggers de auditoría (DELETE_STORE/audit) que
-- impiden físicamente el hard-delete de stores (FK a la propia fila en el
-- mismo statement). Solo aplica a filas SINTÉTICAS b10b creadas por el
-- fixture. Los profiles NO se hard-delean (prevent_hard_delete_profile,
-- Iteración 12 — política absoluta): reciben soft-delete sancionado.
-- Idempotente. Ejecutar ANTES de recrear fixture y al FINAL del ciclo.
-- ═══════════════════════════════════════════════════════════════════

SET session_replication_role = replica;

-- 1) dependientes de devoluciones / movimientos
DELETE FROM public.audit_logs WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM public.audit_logs WHERE store_id IS NULL AND action IN ('CREATE_USER','DELETE_USER')
  AND (record_id::text LIKE 'b10b%' OR metadata::text LIKE '%b10b%'
       OR record_id IN (SELECT id FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'));
DELETE FROM public.business_events WHERE entity_id IN (
  SELECT id FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%')
  OR entity_id IN (SELECT id FROM public.devolutions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000003%');
DELETE FROM public.wac_change_log WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM public.kardex_entries WHERE product_id IN (SELECT id FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%');
DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%');
DELETE FROM public.devolution_items WHERE devolution_id::text LIKE 'b10b0000-0000-4000-8000-0000000003%';
DELETE FROM public.devolutions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000003%';

-- 2) financieros (DF-03)
DELETE FROM public.payment_transactions WHERE ref_type='devolution' AND ref_id::text LIKE 'b10b0000-0000-4000-8000-0000000003%';
DELETE FROM public.cash_movements WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM public.cash_register_sessions WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM public.store_credit_ledger WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');

-- 3) catálogos del fixture
DELETE FROM public.transaction_items WHERE transaction_id IN (
  SELECT id FROM public.transactions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000004%');
DELETE FROM public.transactions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000004%';
DELETE FROM public.inventory WHERE product_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%';
DELETE FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%';
DELETE FROM public.document_sequences WHERE store_id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM public.user_store_memberships WHERE user_id IN (
  'b10b0000-0000-4000-8000-0000000001a1','b10b0000-0000-4000-8000-0000000001b2',
  'b10b0000-0000-4000-8000-0000000001d4','b10b0000-0000-4000-8000-0000000001c3');
DELETE FROM public.stores WHERE id IN ('b10b0000-0000-4000-8000-00000000000a','b10b0000-0000-4000-8000-00000000000b');
DELETE FROM auth.identities WHERE user_id IN (
  'b10b0000-0000-4000-8000-0000000001a1','b10b0000-0000-4000-8000-0000000001b2',
  'b10b0000-0000-4000-8000-0000000001d4','b10b0000-0000-4000-8000-0000000001c3');

-- 4) perfiles: soft-delete sancionado (hard-delete prohibido por Iteración 12)
UPDATE public.profiles SET
  is_active = false,
  deleted_at = COALESCE(deleted_at, now()),
  deletion_reason = 'b10b fixture cleanup (hard-delete blocked by prevent_hard_delete_profile)',
  updated_at = now()
WHERE id IN ('b10b0000-0000-4000-8000-0000000001a1','b10b0000-0000-4000-8000-0000000001b2',
             'b10b0000-0000-4000-8000-0000000001d4','b10b0000-0000-4000-8000-0000000001c3');

SET session_replication_role = DEFAULT;

-- 5) verificación de residuos (0 esperado, salvo 4 perfiles soft-deleted + 4 auth.users)
SELECT jsonb_build_object(
  'stores', (SELECT count(*) FROM public.stores WHERE id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'memberships', (SELECT count(*) FROM public.user_store_memberships WHERE user_id::text LIKE 'b10b0000-0000-4000-8000-0000000001%'),
  'products', (SELECT count(*) FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'inventory', (SELECT count(*) FROM public.inventory WHERE product_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'movements', (SELECT count(*) FROM public.stock_movements WHERE product_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'kardex', (SELECT count(*) FROM public.kardex_entries WHERE product_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'devolutions', (SELECT count(*) FROM public.devolutions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000003%'),
  'devolution_items', (SELECT count(*) FROM public.devolution_items WHERE devolution_id::text LIKE 'b10b0000-0000-4000-8000-0000000003%'),
  'transactions', (SELECT count(*) FROM public.transactions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000004%'),
  'payments_dev', (SELECT count(*) FROM public.payment_transactions WHERE ref_type='devolution' AND ref_id::text LIKE 'b10b0000-0000-4000-8000-0000000003%'),
  'cash_movs', (SELECT count(*) FROM public.cash_movements WHERE store_id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'cash_sessions', (SELECT count(*) FROM public.cash_register_sessions WHERE store_id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'wac_logs', (SELECT count(*) FROM public.wac_change_log WHERE store_id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'audit_rows', (SELECT count(*) FROM public.audit_logs WHERE store_id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'audit_ghosts', (SELECT count(*) FROM public.audit_logs WHERE store_id IS NULL AND action IN ('CREATE_USER','DELETE_USER') AND (record_id::text LIKE 'b10b%' OR metadata::text LIKE '%b10b%')),
  'business_events', (SELECT count(*) FROM public.business_events WHERE entity_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'doc_sequences', (SELECT count(*) FROM public.document_sequences WHERE store_id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'profiles_softdeleted', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000001%' AND deleted_at IS NOT NULL AND NOT is_active),
  'profiles_active_leak', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000001%' AND (deleted_at IS NULL OR is_active)),
  'auth_users', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000001%')
) AS residue;
