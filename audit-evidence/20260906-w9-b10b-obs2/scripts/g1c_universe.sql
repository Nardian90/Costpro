-- GATE 1c · Universo exacto de la tienda d1c4ba0e (READ ONLY)
-- Una sola fila JSON con todas las métricas del universo U y sus capas U1..U9.
SELECT jsonb_build_object(
  'store', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'is_active', s.is_active,
             'is_archived', s.is_archived, 'created_at', s.created_at, 'tenant_id', s.tenant_id)
            FROM stores s WHERE s.id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'products_total',        (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'products_active',       (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND is_active),
  'products_inactive',     (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND NOT is_active),
  'products_by_status',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', st, 'n', n)), '[]')
                             FROM (SELECT status st, count(*) n FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY status) x),
  'u1_stock_gt0_count',    (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current > 0),
  'u1_stock_gt0_units',    (SELECT COALESCE(SUM(stock_current),0) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current > 0),
  'u1_stock_gt0_active',   (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current > 0 AND is_active),
  'u1_stock_lt0',          (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current < 0),
  'u1_stock_eq0',          (SELECT count(*) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current = 0),
  'u1_by_has_movements',   (SELECT COALESCE(jsonb_agg(jsonb_build_object('has_movements', hm, 'stock_gt0', sgt0, 'n', n)), '[]')
                             FROM (SELECT has_movements hm, (stock_current>0) sgt0, count(*) n
                                   FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
                                   GROUP BY has_movements, (stock_current>0)) x),
  'u2_inventory_rows',     (SELECT count(*) FROM inventory WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u2_inventory_units',    (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u3_stock_movements',    (SELECT count(*) FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u4_kardex_entries',     (SELECT count(*) FROM kardex_entries WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u5_transactions',       (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u5_transaction_items',  (SELECT count(*) FROM transaction_items ti WHERE ti.transaction_id IN
                             (SELECT id FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')),
  'u5_devolutions',        (SELECT count(*) FROM devolutions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u6_receipts',           (SELECT count(*) FROM receipts WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u6_purchase_orders',    (SELECT count(*) FROM purchase_orders WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u7_production_orders',  (SELECT count(*) FROM production_orders WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u8_adjustments',        (SELECT count(*) FROM inventory_adjustments WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u8_physical_counts',    (SELECT count(*) FROM physical_counts WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u9_transfers_origin',   (SELECT count(*) FROM transfers WHERE origin_store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u9_transfers_dest',     (SELECT count(*) FROM transfers WHERE destination_store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'lots',                  (SELECT count(*) FROM product_lots WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'batches',               (SELECT count(*) FROM inventory_batches WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'inv_movements_nolink',  (SELECT count(*) FROM inventory_movements im WHERE im.product_id IN
                             (SELECT id FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')),
  'inventory_snapshots',   (SELECT count(*) FROM inventory_snapshots WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'store_reset_snapshots', (SELECT count(*) FROM store_reset_snapshots WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'store_reset_snapshot_meta', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                             'id', r.id, 'initiated_by', r.initiated_by, 'keep_catalog', r.keep_catalog,
                             'created_at', r.created_at, 'expires_at', r.expires_at,
                             'snapshot_bytes', length(r.snapshot::text))), '[]')
                             FROM store_reset_snapshots r WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'quotations',            (SELECT count(*) FROM quotations WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'issue_slips',           (SELECT count(*) FROM issue_slips WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'warehouses',            (SELECT count(*) FROM warehouses WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'warehouse_stock_rows',  (SELECT count(*) FROM warehouse_stock ws WHERE ws.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'audit_logs_store',      (SELECT count(*) FROM audit_logs WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'audit_events_store',    (SELECT count(*) FROM audit_events WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'u1_matrix', (SELECT jsonb_build_object(
      'with_inventory',    (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM inventory i WHERE i.store_id=p.store_id AND i.product_id=p.id)),
      'with_movements',    (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM stock_movements m WHERE m.store_id=p.store_id AND m.product_id=p.id)),
      'with_kardex',       (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM kardex_entries k WHERE k.store_id=p.store_id AND k.product_id=p.id)),
      'with_transactions', (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM transaction_items ti JOIN transactions t ON t.id=ti.transaction_id
                                          WHERE t.store_id=p.store_id AND ti.product_id=p.id)),
      'with_receipts',     (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id
                                          WHERE r.store_id=p.store_id AND ri.product_id=p.id)),
      'with_production',   (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM production_order_items poi JOIN production_orders po ON po.id=poi.order_id
                                          WHERE po.store_id=p.store_id AND (poi.product_id=p.id OR po.output_product_id=p.id))),
      'with_adjustments',  (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM inventory_adjustment_items ai JOIN inventory_adjustments a ON a.id=ai.adjustment_id
                                          WHERE a.store_id=p.store_id AND ai.product_id=p.id)),
      'with_transfers',    (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM transfer_items tfi JOIN transfers tf ON tf.id=tfi.transfer_id
                                          WHERE (tf.origin_store_id=p.store_id OR tf.destination_store_id=p.store_id)
                                          AND (tfi.product_id=p.id OR tfi.destination_product_id=p.id))),
      'with_physcounts',   (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM physical_count_items pci JOIN physical_counts pc ON pc.id=pci.count_id
                                          WHERE pc.store_id=p.store_id AND pci.product_id=p.id)),
      'with_quotations',   (SELECT count(*) FROM products p WHERE p.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND p.stock_current>0
                              AND EXISTS (SELECT 1 FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id
                                          WHERE q.store_id=p.store_id AND qi.product_id=p.id))
  ))
) AS evidence;
