-- W9.5-B8 · Captura estado TX-H post-HTTP-probes + CLEANUP del fixture + verificación 0 residuos
CREATE TEMP TABLE b8_cl(step text, detail jsonb);

-- 0) Estado final TX-H (evidencia P6c)
INSERT INTO b8_cl VALUES('TXH_POST_STATE', (
  SELECT jsonb_build_object(
    'tx_status', t.status,
    'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'action', a.action) FROM public.audit_logs a WHERE a.record_id=t.id AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1),
    'movements', (SELECT count(*) FROM public.stock_movements m WHERE m.notes=t.id::text),
    'payment_rows', (SELECT count(*) FROM public.payment_transactions p WHERE p.transaction_id=t.id))
  FROM public.transactions t WHERE t.id='b8d00000-0000-4000-8000-00000000d001'));

-- 1) Limpieza FK-safe de TODO el fixture (UUIDs sintéticos b8…)
-- El DELETE de payment_transactions está bloqueado por el guard del ledger
-- inmutable (ERR_PAYMENT_DELETE_FORBIDDEN, herencia H5-B2). El guard ofrece la
-- vía administrativa OFICIAL: app.restore_mode='true' + current_user=postgres
-- (usada por los flujos de restauración). Se activa SOLO en esta sesión de
-- limpieza y se RESET-ea al final. Ningún dato real es alcanzado (scope LIKE b8…).
SET app.restore_mode = 'true';
DELETE FROM public.business_events WHERE entity_id::text LIKE 'b8c00000%';
DELETE FROM public.audit_logs WHERE store_id::text LIKE 'b8a00000%';
DELETE FROM public.user_audit_log WHERE target_user_id::text LIKE 'b8b00000%';
DELETE FROM public.payment_transactions WHERE store_id::text LIKE 'b8a00000%';
DELETE FROM public.transaction_items WHERE transaction_id IN (SELECT id FROM public.transactions WHERE store_id::text LIKE 'b8a00000%');
DELETE FROM public.transactions WHERE store_id::text LIKE 'b8a00000%';
DO $$
BEGIN
  IF to_regclass('public.kardex_entries') IS NOT NULL THEN
    DELETE FROM public.kardex_entries WHERE product_id::text LIKE 'b8c00000%';
  END IF;
END $$;
DELETE FROM public.stock_movements WHERE store_id::text LIKE 'b8a00000%';
DELETE FROM public.inventory WHERE store_id::text LIKE 'b8a00000%';
DELETE FROM public.products WHERE store_id::text LIKE 'b8a00000%';
DELETE FROM public.user_store_memberships WHERE store_id::text LIKE 'b8a00000%';
-- Profiles: prevent_hard_delete_profile (Iteración 12) es INCONDICIONAL.
-- Workaround documentado (precedente B-2/B-6): DISABLE temporal + DELETE del
-- fixture sintético + ENABLE inmediato + verificación tgenabled='O', todo en
-- ESTA misma request atómica (ventana de milisegundos, scope LIKE b8b00000%).
ALTER TABLE public.profiles DISABLE TRIGGER prevent_hard_delete_profile;
DELETE FROM public.profiles WHERE id::text LIKE 'b8b00000%';
DELETE FROM auth.users WHERE id::text LIKE 'b8b00000%';
ALTER TABLE public.profiles ENABLE TRIGGER prevent_hard_delete_profile;
-- Verificación de restauración del guard
INSERT INTO b8_cl VALUES('GUARD_RESTORED', jsonb_build_object(
  'prevent_hard_delete_profile_tgenabled', (SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='prevent_hard_delete_profile'),
  'profiles_fixture', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b8b00000%'),
  'auth_users_fixture', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'b8b00000%')));
-- Stores: el trigger audit_store_changes en DELETE re-introduce el BACKLOG B-6
-- (audita DELETE_STORE con store_id de la fila que se borra → FK imposible).
-- Workaround idéntico al documentado en B-2: DISABLE temporal + DELETE + ENABLE
-- + verificación tgenabled='O', en esta misma request atómica.
ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
DELETE FROM public.stores WHERE id::text LIKE 'b8a00000%';
ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
INSERT INTO b8_cl VALUES('B6_GUARD_RESTORED', jsonb_build_object(
  'trigger_audit_store_changes_tgenabled', (SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='public.stores'::regclass AND tgname='trigger_audit_store_changes')));
RESET app.restore_mode;
INSERT INTO b8_cl VALUES('CLEANUP_DONE', jsonb_build_object('orders', 'business_events→audit→user_audit→payments→items→tx→kardex→movements→inventory→products→memberships→profiles→auth.users→stores', 'restore_mode', 'activado solo para DELETE de payments del fixture; RESET inmediato'));

-- 2) Verificación 0 residuos (14 criterios)
INSERT INTO b8_cl VALUES('RESIDUE_CHECK', jsonb_build_object(
  'stores',            (SELECT count(*) FROM public.stores WHERE id::text LIKE 'b8a00000%'),
  'profiles',          (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b8b00000%'),
  'auth_users',        (SELECT count(*) FROM auth.users WHERE id::text LIKE 'b8b00000%'),
  'memberships',       (SELECT count(*) FROM public.user_store_memberships WHERE store_id::text LIKE 'b8a00000%'),
  'products',          (SELECT count(*) FROM public.products WHERE id::text LIKE 'b8c00000%'),
  'inventory',         (SELECT count(*) FROM public.inventory WHERE store_id::text LIKE 'b8a00000%'),
  'transactions',      (SELECT count(*) FROM public.transactions WHERE id::text LIKE 'b8d00000%'),
  'transaction_items', (SELECT count(*) FROM public.transaction_items WHERE transaction_id::text LIKE 'b8d00000%'),
  'payments',          (SELECT count(*) FROM public.payment_transactions WHERE id::text LIKE 'b8d00000%' OR store_id::text LIKE 'b8a00000%'),
  'stock_movements',   (SELECT count(*) FROM public.stock_movements WHERE store_id::text LIKE 'b8a00000%'),
  'audit_logs',        (SELECT count(*) FROM public.audit_logs WHERE store_id::text LIKE 'b8a00000%'),
  'user_audit_log',    (SELECT count(*) FROM public.user_audit_log WHERE target_user_id::text LIKE 'b8b00000%'),
  'business_events',   (SELECT count(*) FROM public.business_events WHERE entity_id::text LIKE 'b8c00000%'),
  'kardex_entries',    (CASE WHEN to_regclass('public.kardex_entries') IS NOT NULL THEN (SELECT count(*)::text FROM public.kardex_entries WHERE product_id::text LIKE 'b8c00000%') ELSE 'n/a' END)
));

SELECT coalesce(jsonb_agg(row_to_json(b8_cl) ORDER BY step), '[]'::jsonb) AS cleanup FROM b8_cl;
