-- GATE 5/13 · Qué sobrevivió al purge del 08-17 + anomalías globales por producto (READ ONLY)
WITH pl AS (
  SELECT rs.backup_payload AS p FROM restore_sessions rs
  WHERE rs.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ORDER BY rs.initiated_at DESC LIMIT 1
)
SELECT jsonb_build_object(
  'purge_survival', (
    SELECT jsonb_build_object(
      'products_backup', (SELECT jsonb_array_length(p->'tables'->'products') FROM pl),
      'products_surviving', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr
        JOIN products t ON t.id=(pr->>'id')::uuid),
      'transactions_backup', (SELECT jsonb_array_length(p->'tables'->'transactions') FROM pl),
      'transactions_surviving', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'transactions' FROM pl)) pr
        JOIN transactions t ON t.id=(pr->>'id')::uuid),
      'receipts_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'receipts'),0) FROM pl),
      'receipts_surviving', (SELECT count(*) FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'receipts' FROM pl),'[]'::jsonb)) pr
        JOIN receipts t ON t.id=(pr->>'id')::uuid),
      'transfers_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'transfers'),0) FROM pl),
      'transfers_surviving', (SELECT count(*) FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'transfers' FROM pl),'[]'::jsonb)) pr
        JOIN transfers t ON t.id=(pr->>'id')::uuid),
      'payments_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'payment_transactions'),0) FROM pl),
      'payments_surviving', (SELECT count(*) FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'payment_transactions' FROM pl),'[]'::jsonb)) pr
        JOIN payment_transactions t ON t.id=(pr->>'id')::uuid),
      'commission_rules_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'commission_rules'),0) FROM pl),
      'commission_rules_surviving', (SELECT count(*) FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'commission_rules' FROM pl),'[]'::jsonb)) pr
        JOIN commission_rules t ON t.id=(pr->>'id')::uuid),
      'warehouses_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'warehouses'),0) FROM pl),
      'warehouses_surviving', (SELECT count(*) FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'warehouses' FROM pl),'[]'::jsonb)) pr
        JOIN warehouses t ON t.id=(pr->>'id')::uuid),
      'devolutions_backup', (SELECT COALESCE(jsonb_array_length(p->'tables'->'devolutions'),0) FROM pl)
    )),
  'store_tables_today', (
    SELECT jsonb_build_object(
      'transfers', (SELECT count(*) FROM transfers WHERE origin_store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' OR destination_store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'quotations', (SELECT count(*) FROM quotations WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'issue_slips', (SELECT count(*) FROM issue_slips WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'cash_sessions', (SELECT count(*) FROM cash_sessions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'z_reports', (SELECT count(*) FROM z_reports WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'customers', (SELECT count(*) FROM customers WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'suppliers', (SELECT count(*) FROM suppliers WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'commission_rules', (SELECT count(*) FROM commission_rules WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'inventory_reservations', (SELECT count(*) FROM inventory_reservations WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'warehouses', (SELECT count(*) FROM warehouses WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'user_store_memberships', (SELECT count(*) FROM user_store_memberships WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'orphan_payments_check', (SELECT count(*) FROM payment_transactions pt
        WHERE pt.transaction_id IN (SELECT (pr->>'id')::uuid FROM jsonb_array_elements(COALESCE((SELECT p->'tables'->'transactions' FROM pl),'[]'::jsonb)) pr)
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = pt.transaction_id))
    )),
  'global_anomalies', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'store', left(p.store_id::text,8), 'product', p.id::text, 'sku', p.sku,
        'name', left(p.name,28), 'stock', p.stock_current,
        'inv_qty', COALESCE(inv.quantity,-1),
        'movs_sum', COALESCE(mv.q,0), 'movs_n', COALESCE(mv.n,0),
        'cls', CASE
          WHEN inv.product_id IS NULL AND mv.product_id IS NULL THEN 'ORPHAN_FULL'
          WHEN inv.product_id IS NULL THEN 'ORPHAN_NO_INVENTORY'
          WHEN mv.product_id IS NULL THEN 'ORPHAN_NO_MOVEMENTS'
          WHEN inv.quantity <> p.stock_current OR COALESCE(mv.q,0) <> p.stock_current THEN 'MISMATCH'
          ELSE 'OK' END)
      ORDER BY p.store_id, p.stock_current DESC), '[]')
    FROM products p
    LEFT JOIN inventory inv ON inv.store_id=p.store_id AND inv.product_id=p.id
    LEFT JOIN (SELECT store_id, product_id, SUM(quantity_change)::numeric q, count(*) n
               FROM stock_movements GROUP BY 1,2) mv ON mv.store_id=p.store_id AND mv.product_id=p.id
    WHERE p.stock_current > 0
      AND (inv.product_id IS NULL OR mv.product_id IS NULL
           OR inv.quantity <> p.stock_current OR COALESCE(mv.q,0) <> p.stock_current)
  )
) AS evidence;
