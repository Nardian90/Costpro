SELECT jsonb_build_object(
  'batch_movements', (SELECT count(*) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
  'batch_units', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
  'inventory_store', (SELECT count(*) FROM inventory WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'audit_batch_rows', (SELECT count(*) FROM audit_logs WHERE action='STOCK_RECONCILIATION_OPENING')
) AS final_state;
