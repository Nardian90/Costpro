-- R14: kardex con unit_cost 0 (valoración vacía) + payment_transactions integridad
SELECT 'kardex_zero_unit_cost_in' AS metric,
       COUNT(*) FILTER (WHERE k.movement_type IN ('in','devolution_in','transfer_in','purchase_reverse','sale_reverse') AND k.unit_cost=0)::text AS value,
       COUNT(*) FILTER (WHERE k.movement_type IN ('in','devolution_in','transfer_in') AND k.unit_cost=0)::text AS entries_in_only
FROM kardex_entries k
UNION ALL
SELECT 'payments_by_reftype:'||COALESCE(pt.ref_type,'null'), COUNT(*)::text, '0'
FROM payment_transactions pt GROUP BY pt.ref_type
UNION ALL
SELECT 'payments_orphan_sale', COUNT(*)::text, '0'
FROM payment_transactions pt
LEFT JOIN transactions t ON t.id::text = pt.ref_id AND pt.ref_type='sale'
WHERE pt.ref_type='sale' AND t.id IS NULL;
