-- w7-fingerprint-scoped.sql — huella acotada a objetos afectados por W6.2 (FASE 16)
-- Uso: psql -v TAG=<pre|post_mig|post_rb> -f este archivo
\pset pager off
SELECT 'FP|' || :'TAG' || '|FUNC|' || p.oid::regprocedure::text || '|' || md5(coalesce(p.prosrc,'')) ||
  '|' || coalesce(array_to_string(p.proacl,','),'NULL') || '|' || prosecdef::text
FROM pg_proc p
WHERE p.pronamespace::regnamespace::text='public'
  AND p.oid::regprocedure::text IN (
    'confirm_pending_reception(uuid,uuid,timestamp with time zone)',
    'fn_process_receipt(jsonb,uuid,text)',
    'fn_process_receipt(jsonb,uuid,uuid,text)',
    'perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone)',
    'cancel_reception(uuid)',
    'reverse_receipt_v2(uuid,text,uuid)',
    'void_reception_with_reversal(uuid,uuid,text,timestamp with time zone)',
    'receive_production_output(uuid,uuid,numeric,uuid,uuid,text)',
    'receive_production_output(uuid,uuid,numeric,uuid)',
    'reverse_production_order(uuid,text,uuid)',
    'void_closed_production_order(uuid,text,uuid)',
    'create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric)',
    'create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text)',
    'create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)',
    'create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid)',
    'confirm_transfer(uuid,uuid,timestamp with time zone)',
    'reverse_transfer(uuid,text,uuid)',
    'close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text)',
    'validate_payment_transactions_invariants()',
    'create_vale_salida(uuid,jsonb,uuid,text,text)',
    'create_vale_salida(uuid,jsonb,uuid,text,text,uuid)',
    'withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text)',
    'withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean)',
    'update_product_wac()',
    'fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)',
    'withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text)')
ORDER BY p.oid::regprocedure::text;

SELECT 'FP|' || :'TAG' || '|TRG|' || t.tgrelid::regclass::text || '|' || t.tgname || '|' || p.proname || '|' || md5(pg_get_triggerdef(t.oid))
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND (
  t.tgrelid IN ('public.products'::regclass,'public.receipt_items'::regclass)
  OR p.proname IN ('w62_guard_wac_writer','update_product_wac','validate_payment_transactions_invariants'))
ORDER BY t.tgrelid::regclass::text, t.tgname;

SELECT 'FP|' || :'TAG' || '|CON|' || conrelid::regclass::text || '|' || conname || '|' || md5(pg_get_constraintdef(oid))
FROM pg_constraint
WHERE conrelid = 'public.payment_transactions'::regclass
ORDER BY conname;

SELECT 'FP|' || :'TAG' || '|TAB|' || c.relname || '|' || coalesce(i.idx, 'no-idx')
FROM pg_class c
LEFT JOIN (SELECT indrelid, string_agg(indexrelid::regclass::text,',' ORDER BY indexrelid::regclass::text) AS idx
           FROM pg_index GROUP BY indrelid) i ON i.indrelid=c.oid
WHERE c.oid IN (to_regclass('public.wac_change_log'),to_regclass('public.w62_zero_cost_flags'),
  to_regclass('public.store_credit_ledger'),to_regclass('public.w62_df04_design_params'),
  to_regclass('public.w62_df04_synthetic_rows'))
ORDER BY c.relname;

SELECT 'FP|' || :'TAG' || '|COL|' || attrelid::regclass::text || '|' || attname
FROM pg_attribute
WHERE attrelid='public.payment_transactions'::regclass AND attname='direction' AND NOT attisdropped;
