-- R17: pagos de devoluciones fantasma + POs alcanzables por receive_purchase
SELECT 'dev_payment:'||d.devolution_number AS metric,
       pt.amount::text || ' ' || COALESCE(pt.currency,'') || ' | doc=' || COALESCE(d.total_amount::text,'?') AS value
FROM payment_transactions pt
JOIN devolutions d ON d.id = pt.ref_id
WHERE pt.ref_type='devolution' AND d.store_id = (SELECT id FROM stores WHERE name='TIENDA CENTRAL COSTPRO')
UNION ALL
SELECT 'po_with_purchase_items', COUNT(*)::text FROM purchase_orders po
WHERE EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_order_id = po.id)
UNION ALL
SELECT 'purchase_items_rows', COUNT(*)::text FROM purchase_items pi
UNION ALL
SELECT 'po_statuses', (SELECT string_agg(DISTINCT status,',') FROM purchase_orders);
