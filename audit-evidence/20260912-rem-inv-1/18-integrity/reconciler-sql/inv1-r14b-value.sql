-- R14b: valoración vacía en kardex + integridad de pagos (casts corregidos)
SELECT 'kardex_zero_unit_cost' AS metric,
       COUNT(*) FILTER (WHERE k.movement_type IN ('in','devolution_in','transfer_in','purchase_reverse') AND k.unit_cost=0)::text AS value
FROM kardex_entries k
UNION ALL
SELECT 'kardex_zero_cost_entries_prod_stores',
       COUNT(*)::text
FROM kardex_entries k JOIN stores s ON s.id=k.store_id
WHERE k.unit_cost=0 AND s.name IN ('Puerto Padre VITALLCONS','ENERVIDA-VITALLCONS','TIENDA CENTRAL COSTPRO')
UNION ALL
SELECT 'payments_ref_type:'||COALESCE(pt.ref_type,'null'), COUNT(*)::text
FROM payment_transactions pt GROUP BY pt.ref_type;
