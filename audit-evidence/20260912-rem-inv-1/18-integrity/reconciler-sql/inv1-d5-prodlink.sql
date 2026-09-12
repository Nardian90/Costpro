-- D5: semántica de reference_id en movimientos de producción
SELECT sm.movement_type, sm.reference_id::text AS ref, sm.reference_doc,
       (poi.id IS NOT NULL) AS is_po_item_id,
       (po.id IS NOT NULL) AS is_po_id
FROM stock_movements sm
LEFT JOIN production_order_items poi ON poi.id::text = sm.reference_id
LEFT JOIN production_orders po ON po.id::text = sm.reference_id
WHERE sm.movement_type IN ('production_in','production_out','production_reverse')
ORDER BY sm.movement_date DESC LIMIT 20;
