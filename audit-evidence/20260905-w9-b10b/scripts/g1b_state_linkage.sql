-- GATE 1b v2: state machine + linkage real (plano, con CTEs)
WITH sm_link AS (
  SELECT count(*) AS return_movements_total,
         count(DISTINCT reference_id) AS dev_with_return_movements
  FROM public.stock_movements WHERE movement_type='return'
),
items_nomove AS (
  SELECT count(*) AS items_without_movement
  FROM public.devolution_items di
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id = di.devolution_id::text
      AND sm.movement_type='return'
      AND sm.product_id = di.product_id)
),
rev AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', d.id, 'status', d.status, 'reversed_at', d.reversed_at,
    'store', d.store_id,
    'has_movement', EXISTS (
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id = d.id::text AND sm.movement_type='return')
  )) AS arr
  FROM public.devolutions d WHERE d.status='reversed'
),
wac_trg AS (
  SELECT jsonb_agg(jsonb_build_object(
    'table', tgrelid::regclass::text, 'name', tgname, 'def', pg_get_triggerdef(t.oid))) AS arr
  FROM pg_trigger t
  WHERE NOT tgisinternal AND t.tgfoid::regproc::text LIKE '%wac%'
),
sm_cols AS (
  SELECT jsonb_build_object(
    'reference_id_type', (SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='stock_movements' AND column_name='reference_id'),
    'reference_doc_type', (SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='stock_movements' AND column_name='reference_doc')
  ) AS obj
),
fnvt AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_validate_document_transition'
)
SELECT jsonb_build_object(
  'fn_validate_document_transition', (SELECT def FROM fnvt),
  'wac_triggers', (SELECT arr FROM wac_trg),
  'return_movements_total', (SELECT return_movements_total FROM sm_link),
  'dev_with_return_movements', (SELECT dev_with_return_movements FROM sm_link),
  'devolutions_items_without_movement', (SELECT items_without_movement FROM items_nomove),
  'reversed_devolutions', (SELECT arr FROM rev),
  'movement_type_col_check', (SELECT obj FROM sm_cols)
) AS capture2;
