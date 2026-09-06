-- R1 · §26 ROLLBACK DRY-RUN (100% READ-ONLY — no compensation is executed here)
-- Per design 17-rollback-design.md: compensatory movements via the canonical RPC,
-- append-only, batch-linked, with declared position asymmetry.
SELECT jsonb_build_object(
  'dry_run', true,
  'repair_batch_id', 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW',
  'rollback_batch_id_planned', 'B10B-OBS2-RECON-ROLLBACK:<ts>-<rand>:ref=B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW',
  'integrity', jsonb_build_object(
    'batch_movements', (SELECT count(*) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'batch_units', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'batch_value_exact', (SELECT COALESCE(SUM(quantity_change * unit_cost),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'products_with_expected_inventory', (
      SELECT count(*) FROM inventory i
      WHERE i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
        AND i.quantity = (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements sm
                          WHERE sm.product_id = i.product_id AND sm.store_id = i.store_id)
    ),
    'inventory_rows_total', (SELECT count(*) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'post_batch_movements_outside_batch', (
      SELECT count(*) FROM stock_movements
      WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
        AND reference_doc IS DISTINCT FROM 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
    ),
    'rollback_marker_already_present', (SELECT count(*) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-ROLLBACK:%')
  ),
  'compensation_plan', (
    SELECT jsonb_build_object(
      'entries', count(*),
      'total_qty', COALESCE(SUM(v.q),0),
      'total_value_exact', COALESCE(SUM(v.q * v.w),0),
      'mechanism', 'register_stock_movement(p_quantity => -q, p_movement_type => ''adjustment'', p_reason => rollback_batch_id, p_unit_cost => cost_average, p_skip_access_check => false)',
      'sample_3', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', m.product_id, 'qty', -m.quantity_change, 'unit_cost', m.unit_cost)), '[]'::jsonb)
        FROM (SELECT * FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW' ORDER BY created_at LIMIT 3) m
      )
    )
    FROM (SELECT m.product_id, m.quantity_change q, m.unit_cost w
          FROM stock_movements m
          WHERE m.reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW') v
  ),
  'expected_post_rollback', jsonb_build_object(
    'inventory_rows', '98 rows REMAIN with quantity=0 (append-only; pre-opening they did not exist)',
    'movements_net', '98 opening + 98 compensation = 0 net quantity; opening rows are NEVER deleted',
    'kardex', '+98 ''in'' + 98 ''adjustment'' entries; history intact',
    'stock_current', '0 for the 98 (POSITION-DESTRUCTIVE asymmetry declared in design 17-rollback-design.md §asimetría)',
    'wac', 'cost_average preserved (no recalculation; S+q=0 case documented)',
    'audit', 'new batch row action=''STOCK_RECONCILIATION_ROLLBACK''; nothing deleted',
    'reopening', 'requires NEW batch -R2 + NEW human authorization (11-idempotency.md §B1)'
  ),
  'executed_here', false
) AS rollback_dry_run;
