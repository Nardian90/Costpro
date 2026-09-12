-- D3: semántica de reference_id en movimientos purchase (linkage a receipts/items/PO)
SELECT sm.reference_id::text AS ref, sm.reference_doc, sm.movement_date::date,
       (r.id IS NOT NULL) AS is_receipt_id,
       (ri.id IS NOT NULL) AS is_receipt_item_id,
       (po.id IS NOT NULL) AS is_po_id,
       r.store_id::text AS receipt_store
FROM stock_movements sm
LEFT JOIN receipts r ON r.id::text = sm.reference_id
LEFT JOIN receipt_items ri ON ri.id::text = sm.reference_id
LEFT JOIN purchase_orders po ON po.id::text = sm.reference_id
WHERE sm.movement_type='purchase'
ORDER BY sm.movement_date DESC LIMIT 20;
