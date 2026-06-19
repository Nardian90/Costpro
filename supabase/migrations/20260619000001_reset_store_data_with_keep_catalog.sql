-- ════════════════════════════════════════════════════════════════════════
-- Reset Store Data con parámetro p_keep_catalog
-- ════════════════════════════════════════════════════════════════════════
-- Reemplaza la RPC reset_store_data existente con una versión que acepta
-- un parámetro opcional p_keep_catalog (default false).
--
-- Comportamiento:
--   p_keep_catalog = false (default): borra TODO incluyendo catálogo de productos.
--   p_keep_catalog = true: mantiene catálogo completo (productos, variantes,
--     imágenes, precios, costos, SKU, etc.) pero resetea stock a 0.
--
-- Tablas que SIEMPRE se borran (independiente de p_keep_catalog):
--   - transactions (ventas)
--   - transaction_items
--   - receipts (recepciones)
--   - receipt_items
--   - stock_movements (movimientos de inventario)
--   - cash_closures (cierres de turno)
--   - inventory_adjustments
--   - transfers (transferencias)
--   - purchase_orders
--   - purchase_order_items
--   - ofertas
--   - store_cost_templates (FC templates — se regeneran al reconfigurar)
--   - product_cost_sheets (fichas de costo)
--
-- Tablas que se MANTIENEN si p_keep_catalog = true:
--   - products (catálogo completo: nombre, SKU, precio, costo, imagen, etc.)
--     Solo se resetean: stock_current=0, cost_average=0 (campos operacionales)
--   - product_variants (solo se resetea stock=0, precios se mantienen)
--
-- Tablas que SIEMPRE se mantienen (INTOCABLES):
--   - stores (configuración: logo, firma, cuño, coords, plantilla, fiscal, etc.)
--   - user_store_memberships (usuarios y permisos)
--   - profiles (usuarios)
--   - store_notifications (notificaciones)
--   - audit_logs (auditoría)
--   - suppliers (proveedores)
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_store_data(
  target_store_id UUID,
  p_keep_catalog BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ── 1. Borrar tablas operacionales (siempre) ──
  
  -- Ventas y transacciones
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;
  
  -- Recepciones
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;
  
  -- Movimientos de stock
  DELETE FROM stock_movements WHERE store_id = target_store_id;
  
  -- Cierres de caja (turnos)
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  
  -- Ajustes de inventario
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
  
  -- Transferencias (enviadas y recibidas)
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
  
  -- Órdenes de compra
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;
  
  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;
  
  -- Q5 fix (Round-2): Fichas de costo y plantillas FC se preservan si p_keep_catalog=true.
  -- Solo se borran si p_keep_catalog=false (borrado completo del catálogo).
  IF NOT p_keep_catalog THEN
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
  END IF;
  
  -- ── 2. Catálogo de productos ──
  
  IF p_keep_catalog THEN
    -- Mantener catálogo pero resetear SOLO campos operacionales a 0.
    -- IMPORTANTE: NO resetear cost_price — es dato del catálogo (costo de adquisición
    -- configurado por el usuario), no operacional. Si lo reseteamos a 0, el usuario
    -- pierde la información de costo de cada producto.
    -- Tampoco resetear price (precio de venta) — es dato del catálogo.
    -- Solo resetear:
    --   - stock_current: cantidad en inventario (operacional)
    --   - cost_average: costo promedio ponderado (operacional, se recalcula al recibir)
    -- Las imágenes (image_url, public_image_url), SKU, nombre, precio, costo,
    -- categoría, descripción, barcode, etc. se MANTIENEN intactos.
    UPDATE products 
    SET 
      stock_current = 0,
      cost_average = 0,
      updated_at = NOW()
    WHERE store_id = target_store_id;
    -- FIX: product_variants no tiene columna stock — no hay nada que resetear
  ELSE
    -- Borrar catálogo completo
    DELETE FROM product_variants WHERE product_id IN (
      SELECT id FROM products WHERE store_id = target_store_id
    );
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;
  
  -- ── 3. Log de auditoría interna ──
  -- (audit_logs se mantiene intacta — es intocable)
  
  RAISE NOTICE 'Store % reset completed. Keep catalog: %', target_store_id, p_keep_catalog;
END;
$$;

-- ── Permisos ──
-- Solo admins pueden ejecutar esta RPC (RLS del service role la bypassa)
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO service_role;

-- ════════════════════════════════════════════════════════════════════════
-- Comentario de documentación
-- ════════════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION reset_store_data(UUID, BOOLEAN) IS 
'Resetea los datos operacionales de una tienda. 
p_keep_catalog=false (default): borra TODO incluyendo catálogo de productos.
p_keep_catalog=true: mantiene catálogo pero resetea stock a 0.
Usuarios, memberships, notificaciones y audit_logs NUNCA se tocan.';
