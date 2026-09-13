-- DECLARED FINAL STATE (Git) de reset_store_data
-- fuente: 20260820000005_post_restore_reconciliation.sql stmt#0

CREATE OR REPLACE FUNCTION public.reset_store_data(
  p_store_id uuid,
  p_keep_catalog boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  target_store_id uuid := p_store_id;
BEGIN
  -- Validación de acceso
  IF NOT public.has_management_access_as(auth.uid(), target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin, manager or encargado of the store.';
  END IF;

  -- Activar restore_mode para bypassear triggers de validación
  PERFORM set_config('app.restore_mode', 'true', true);

  BEGIN
    -- ── 1. Datos transaccionales ──
    DELETE FROM payment_transactions WHERE store_id = target_store_id;
    DELETE FROM transaction_items WHERE transaction_id IN (
      SELECT id FROM transactions WHERE store_id = target_store_id
    );
    DELETE FROM transactions WHERE store_id = target_store_id;
    DELETE FROM stock_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
    DELETE FROM receipts WHERE store_id = target_store_id;
    DELETE FROM inventory WHERE store_id = target_store_id;
    DELETE FROM cash_closures WHERE store_id = target_store_id;

    -- ── 2. Catálogo de productos ──
    IF p_keep_catalog THEN
      UPDATE products
      SET
        stock_current = 0,
        cost_average = 0,
        updated_at = NOW()
      WHERE store_id = target_store_id;
    ELSE
      DELETE FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE store_id = target_store_id
      );
      DELETE FROM products WHERE store_id = target_store_id;
    END IF;

    -- ── 3. Reconciliación post-restore ──
    -- Después de bypassear triggers, sincronizar products.stock_current
    -- con inventory.quantity. En este punto inventory fue borrado (step 1),
    -- así que todos los productos tendrán stock_current = 0 (correcto para
    -- un reset). La reconciliación es defensiva: si en el futuro se
    -- reconstruye inventory SIN disparar triggers (otro restore), este
    -- código asegura consistencia.
    UPDATE products p
    SET stock_current = COALESCE(
      (SELECT SUM(inv.quantity) FROM inventory inv
       WHERE inv.product_id = p.id AND inv.store_id = p.store_id),
      0
    )
    WHERE p.store_id = target_store_id;

    -- Desactivar restore_mode
    PERFORM set_config('app.restore_mode', 'false', true);

    RAISE NOTICE 'Store % reset completed. Keep catalog: %. Post-restore reconciliation done.', target_store_id, p_keep_catalog;
  EXCEPTION WHEN OTHERS THEN
    -- Asegurar que restore_mode se desactiva incluso si hay error
    PERFORM set_config('app.restore_mode', 'false', true);
    RAISE;
  END;
END;
$$
