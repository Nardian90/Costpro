-- W9.5-B10 · CLEANUP fixture + verificación 0 residuos
CREATE TEMP TABLE b10_cl(step text, detail jsonb);
SET app.restore_mode = 'true';
DELETE FROM public.business_events WHERE payload->>'store_id' = 'b10a0000-0000-4000-8000-0000000000a1' OR payload->>'store_id' = 'b10a0000-0000-4000-8000-0000000000b2';
DELETE FROM public.audit_logs WHERE store_id::text LIKE 'b10a0000%';
DELETE FROM public.user_audit_log WHERE target_user_id::text LIKE 'b10b0000%';
DELETE FROM public.receipt_items WHERE receipt_id::text LIKE 'b10d0000%';
DELETE FROM public.receipts WHERE id::text LIKE 'b10d0000%';
DELETE FROM public.transfer_items WHERE transfer_id::text LIKE 'b10d0000%';
DELETE FROM public.transfers WHERE id::text LIKE 'b10d0000%';
-- Counter-adjustments (ids aleatorios, posible created_by real vía API) viven en
-- las tiendas del fixture: limpiar por store, no por patrón de id.
DELETE FROM public.inventory_adjustment_items WHERE adjustment_id IN (SELECT id FROM public.inventory_adjustments WHERE store_id::text LIKE 'b10a0000%');
DELETE FROM public.inventory_adjustments WHERE store_id::text LIKE 'b10a0000%';
DELETE FROM public.devolution_items WHERE devolution_id::text LIKE 'b10d0000%';
DELETE FROM public.devolutions WHERE id::text LIKE 'b10d0000%';
DELETE FROM public.production_orders WHERE id::text LIKE 'b10d0000%';
DO $$ BEGIN
  IF to_regclass('public.kardex_entries') IS NOT NULL THEN
    DELETE FROM public.kardex_entries WHERE product_id::text LIKE 'b10c0000%';
  END IF;
END $$;
DELETE FROM public.stock_movements WHERE product_id::text LIKE 'b10c0000%' OR store_id::text LIKE 'b10a0000%';
DELETE FROM public.inventory WHERE store_id::text LIKE 'b10a0000%';
DELETE FROM public.products WHERE id::text LIKE 'b10c0000%';
DELETE FROM public.user_store_memberships WHERE store_id::text LIKE 'b10a0000%';
ALTER TABLE public.profiles DISABLE TRIGGER prevent_hard_delete_profile;
DELETE FROM public.profiles WHERE id::text LIKE 'b10b0000%';
DELETE FROM auth.users WHERE id::text LIKE 'b10b0000%';
ALTER TABLE public.profiles ENABLE TRIGGER prevent_hard_delete_profile;
INSERT INTO b10_cl VALUES('GUARD_RESTORED', jsonb_build_object(
  'prevent_hard_delete_profile_tgenabled', (SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='prevent_hard_delete_profile'),
  'profiles_fixture', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b10b0000%'),
  'auth_users_fixture', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'b10b0000%')));
ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
DELETE FROM public.stores WHERE id::text LIKE 'b10a0000%';
ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
INSERT INTO b10_cl VALUES('B6_GUARD_RESTORED', jsonb_build_object(
  'trigger_audit_store_changes_tgenabled', (SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='public.stores'::regclass AND tgname='trigger_audit_store_changes')));
RESET app.restore_mode;

INSERT INTO b10_cl VALUES('RESIDUE_CHECK', jsonb_build_object(
  'stores',            (SELECT count(*) FROM public.stores WHERE id::text LIKE 'b10a0000%'),
  'profiles',          (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b10b0000%'),
  'auth_users',        (SELECT count(*) FROM auth.users WHERE id::text LIKE 'b10b0000%'),
  'memberships',       (SELECT count(*) FROM public.user_store_memberships WHERE store_id::text LIKE 'b10a0000%'),
  'products',          (SELECT count(*) FROM public.products WHERE id::text LIKE 'b10c0000%'),
  'inventory',         (SELECT count(*) FROM public.inventory WHERE store_id::text LIKE 'b10a0000%'),
  'receipts',          (SELECT count(*) FROM public.receipts WHERE id::text LIKE 'b10d0000%'),
  'receipt_items',     (SELECT count(*) FROM public.receipt_items WHERE receipt_id::text LIKE 'b10d0000%'),
  'transfers',         (SELECT count(*) FROM public.transfers WHERE id::text LIKE 'b10d0000%'),
  'transfer_items',    (SELECT count(*) FROM public.transfer_items WHERE transfer_id::text LIKE 'b10d0000%'),
  'adjustments',       (SELECT count(*) FROM public.inventory_adjustments WHERE store_id::text LIKE 'b10a0000%'),
  'adjustment_items',  (SELECT count(*) FROM public.inventory_adjustment_items WHERE adjustment_id IN (SELECT id FROM public.inventory_adjustments WHERE store_id::text LIKE 'b10a0000%')),
  'devolutions',       (SELECT count(*) FROM public.devolutions WHERE id::text LIKE 'b10d0000%'),
  'devolution_items',  (SELECT count(*) FROM public.devolution_items WHERE devolution_id::text LIKE 'b10d0000%'),
  'production_orders', (SELECT count(*) FROM public.production_orders WHERE id::text LIKE 'b10d0000%'),
  'stock_movements',   (SELECT count(*) FROM public.stock_movements WHERE store_id::text LIKE 'b10a0000%' OR product_id::text LIKE 'b10c0000%'),
  'kardex_entries',    (CASE WHEN to_regclass('public.kardex_entries') IS NOT NULL THEN (SELECT count(*)::text FROM public.kardex_entries WHERE product_id::text LIKE 'b10c0000%') ELSE 'n/a' END),
  'audit_logs',        (SELECT count(*) FROM public.audit_logs WHERE store_id::text LIKE 'b10a0000%'),
  'user_audit_log',    (SELECT count(*) FROM public.user_audit_log WHERE target_user_id::text LIKE 'b10b0000%'),
  'business_events',   (SELECT count(*) FROM public.business_events WHERE payload->>'store_id' LIKE 'b10a0000%')
));
SELECT coalesce(jsonb_agg(row_to_json(b10_cl) ORDER BY step), '[]'::jsonb) AS cleanup FROM b10_cl;
