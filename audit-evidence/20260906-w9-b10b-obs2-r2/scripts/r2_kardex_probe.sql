-- R2 · kardex semantics probe on R1 batch rows (READ ONLY)
SELECT jsonb_build_object(
  'captured_at', now(),
  'sample_kardex', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', k.product_id, 'sku', p.sku,
      'movement_type', k.movement_type, 'quantity', k.quantity,
      'unit_cost', k.unit_cost, 'total_value', k.total_value,
      'balance_quantity', k.balance_quantity, 'balance_unit_cost', k.balance_unit_cost, 'balance_total_value', k.balance_total_value,
      'current_stock', p.stock_current, 'inv_qty', i.quantity,
      'reference_id', k.reference_id, 'reference_description', k.reference_description
    ) ORDER BY p.sku), '[]'::jsonb)
    FROM kardex_entries k
    JOIN products p ON p.id = k.product_id
    LEFT JOIN inventory i ON i.product_id = k.product_id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
    WHERE k.reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
      AND k.product_id IN ('e47421ea-f9aa-452b-b20b-4601ec12410f','983e5726-a068-44b0-98b8-fef76ac481f1','da1c4090-3e10-4120-a2bc-24da53cffe16')
  ),
  'balance_distinct', (
    SELECT jsonb_agg(jsonb_build_object('balance_qty', k.balance_quantity, 'n', n)) FROM (
      SELECT k.balance_quantity, count(*) AS n FROM kardex_entries k
      WHERE k.reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
      GROUP BY k.balance_quantity
    ) k
  ),
  'movement_meta', (
    SELECT jsonb_build_object(
      'ref_id_is_sale_id', (SELECT count(*) FROM stock_movements WHERE reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW' AND reference_id IS NULL),
      'ref_doc_sample', (SELECT reference_doc FROM stock_movements WHERE reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW' LIMIT 1),
      'notes_null', (SELECT count(*) FROM stock_movements WHERE reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW' AND notes IS NOT NULL)
    )
  )
) AS probe;
