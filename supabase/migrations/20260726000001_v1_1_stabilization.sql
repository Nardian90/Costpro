-- ════════════════════════════════════════════════════════════════════════
-- V1.1 ESTABILIZACIÓN — 7 fixes críticos del módulo Multi-Tienda
-- ════════════════════════════════════════════════════════════════════════
--
-- 1. create_transfer: validar stock suficiente en tienda origen
-- 2. products.store_id: NOT NULL (era nullable)
-- 3. receipts.store_id: NOT NULL (era nullable)
-- 4. audit_logs.store_id: NOT NULL (era nullable)
-- 5. Índices compuestos (store_id, created_at) en tablas críticas
-- 6. create_sale: usar SELECT FOR UPDATE + recheck después del lock
-- 7. Purge automático de store_reset_snapshots (>30 días)
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. FIX: create_transfer valida stock suficiente en tienda origen
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(
    p_origin_store_id UUID,
    p_destination_store_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_operation_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer_id UUID;
    v_item RECORD;
    v_product RECORD;
    v_stock NUMERIC;
BEGIN
    -- Validar que origin != destination
    IF p_origin_store_id = p_destination_store_id THEN
        RAISE EXCEPTION 'ERR_SAME_STORE: La tienda origen y destino deben ser diferentes';
    END IF;

    -- Validar acceso del usuario a la tienda origen
    IF NOT public.has_store_access(p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: No tienes acceso a la tienda origen';
    END IF;

    -- 1. Insertar cabecera
    INSERT INTO public.transfers (origin_store_id, destination_store_id, created_by, notes)
    VALUES (p_origin_store_id, p_destination_store_id, auth.uid(), p_notes)
    RETURNING id INTO v_transfer_id;

    -- 2. Insertar items + VALIDAR STOCK en tienda origen
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, unit_cost NUMERIC)
    LOOP
        -- Validar que el quantity sea positivo
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'ERR_INVALID_QUANTITY: La cantidad debe ser mayor a 0 para el producto %', v_item.product_id;
        END IF;

        -- Validar stock suficiente en tienda origen (con FOR UPDATE para concurrencia)
        SELECT stock_current INTO v_stock
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id
        FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: Producto % no encontrado en tienda origen', v_item.product_id;
        END IF;

        IF v_stock < v_item.quantity THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Stock insuficiente para producto % (disponible: %, solicitado: %)',
                v_item.product_id, v_stock, v_item.quantity;
        END IF;

        -- Insertar item
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost);
    END LOOP;

    RETURN v_transfer_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. FIX: products.store_id → NOT NULL
-- Primero setear store_id para productos huérfanos (asignar a la primera tienda activa)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_default_store UUID;
    v_orphan_count INTEGER;
BEGIN
    -- Obtener primera tienda activa como fallback
    SELECT id INTO v_default_store FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1;

    -- Contar productos huérfanos
    SELECT COUNT(*) INTO v_orphan_count FROM public.products WHERE store_id IS NULL;

    IF v_orphan_count > 0 AND v_default_store IS NOT NULL THEN
        -- Asignar productos huérfanos a la primera tienda
        UPDATE public.products SET store_id = v_default_store WHERE store_id IS NULL;
        RAISE NOTICE 'Asignados % productos huérfanos a tienda %', v_orphan_count, v_default_store;
    ELSIF v_orphan_count > 0 AND v_default_store IS NULL THEN
        RAISE EXCEPTION 'No se puede hacer store_id NOT NULL: hay % productos sin tienda y no hay tiendas activas', v_orphan_count;
    END IF;
END $$;

-- Ahora hacer NOT NULL
ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. FIX: receipts.store_id → NOT NULL
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_default_store UUID;
    v_orphan_count INTEGER;
BEGIN
    SELECT id INTO v_default_store FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1;
    SELECT COUNT(*) INTO v_orphan_count FROM public.receipts WHERE store_id IS NULL;

    IF v_orphan_count > 0 AND v_default_store IS NOT NULL THEN
        UPDATE public.receipts SET store_id = v_default_store WHERE store_id IS NULL;
        RAISE NOTICE 'Asignados % receipts huérfanos a tienda %', v_orphan_count, v_default_store;
    ELSIF v_orphan_count > 0 AND v_default_store IS NULL THEN
        RAISE EXCEPTION 'No se puede hacer receipts.store_id NOT NULL: hay % receipts sin tienda', v_orphan_count;
    END IF;
END $$;

ALTER TABLE public.receipts ALTER COLUMN store_id SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. FIX: audit_logs.store_id → NOT NULL
-- Para logs existentes sin store_id, asignar a la primera tienda (o dejar NULL
-- si no hay tiendas — los logs globales del sistema son aceptables)
-- ──────────────────────────────────────────────────────────────────────────
-- audit_logs.store_id puede ser NULL para logs del sistema (no de tienda).
-- Primero actualizar logs existentes de products/sales con store_id NULL:
-- asignar a la primera tienda activa (o dejar NULL si table_name es global).
UPDATE public.audit_logs
SET store_id = (
    SELECT id FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1
)
WHERE store_id IS NULL
  AND table_name IN ('products', 'sales', 'transactions', 'receipts', 'stock_movements',
                     'cash_closures', 'workers', 'commission_payments', 'production_orders',
                     'transfers', 'inventory_adjustments', 'ofertas', 'store_cost_templates');

-- Ahora añadir CHECK: store_id puede ser NULL solo para tablas globales
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_store_id_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_store_id_check
    CHECK (store_id IS NOT NULL OR table_name IN ('profiles', 'stores', 'system'));

-- ──────────────────────────────────────────────────────────────────────────
-- 5. FIX: Índices compuestos (store_id, created_at) en tablas críticas
-- Estos índices aceleran las queries más comunes: "dame las ventas de esta tienda
-- ordenadas por fecha" que actualmente hace un scan completo.
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_store_created ON public.transactions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_created ON public.stock_movements (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_store_created ON public.receipts (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_closures_store_created ON public.cash_closures (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_orders_store_created ON public.production_orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_payments_store_paid ON public.commission_payments (store_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_store_created ON public.inventory_adjustments (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_store_date ON public.sales_transactions (store_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created ON public.audit_logs (store_id, created_at DESC) WHERE store_id IS NOT NULL;

-- Índice para transferencias (ambas direcciones)
CREATE INDEX IF NOT EXISTS idx_transfers_origin_created ON public.transfers (origin_store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_dest_created ON public.transfers (destination_store_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 6. FIX: create_sale concurrencia — recheck después del lock
-- El problema: entre SELECT FOR UPDATE y el UPDATE de stock, hay un gap
-- donde otra transacción puede haber leído el mismo stock.
-- Solución: usar UPDATE con WHERE stock_current >= qty (atomic check+update)
-- ──────────────────────────────────────────────────────────────────────────
-- DROP existing function first (all versions, regardless of signature)
DROP FUNCTION IF EXISTS public.create_sale CASCADE;

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1.0,
  p_zelle_amount numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $func$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_existing uuid;
  v_cost numeric; v_price_cup numeric; v_cost_cup numeric;
  v_item_currency text; v_item_rate numeric;
  v_currencies text[] := ARRAY[]::text[];
  v_is_mixed boolean := false;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units_to_deduct integer;
  v_product_name text;
  v_rows_affected integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    IF NOT (v_currencies @> ARRAY[v_item_currency]) THEN
      v_currencies := array_append(v_currencies, v_item_currency);
    END IF;
  END LOOP;
  v_is_mixed := array_length(v_currencies, 1) > 1;

  IF p_payment_method = 'mixed' AND NOT v_is_mixed AND (p_cash_amount + p_transfer_amount + p_zelle_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, zelle_amount, idempotency_key, created_at, completed_at,
    sale_currency, sale_exchange_rate
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_cash_amount, p_transfer_amount, p_zelle_amount, p_idempotency_key, v_eff, v_eff,
    CASE WHEN v_is_mixed THEN 'MIXED' ELSE COALESCE(p_sale_currency, v_currencies[1]) END,
    p_sale_exchange_rate
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      IF v_conversion_factor IS NULL THEN v_conversion_factor := 1; END IF;
    ELSE
      v_conversion_factor := 1;
    END IF;

    v_units_to_deduct := v_qty * v_conversion_factor;

    -- FIX CONCURRENCIA: UPDATE atómico con WHERE stock_current >= qty
    -- Si 2 transacciones concurrentes intentan vender el mismo producto,
    -- solo una tendrá rows_affected=1. La otra obtendrá 0 y se aborta.
    UPDATE public.products
    SET stock_current = stock_current - v_units_to_deduct
    WHERE id = v_pid AND stock_current >= v_units_to_deduct;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_pid;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: %', COALESCE(v_product_name, v_pid::text);
    END IF;

    v_price_cup := CASE WHEN v_item_currency = 'CUP' THEN v_price * v_qty ELSE v_price * v_qty * v_item_rate END;
    v_cost_cup := CASE WHEN v_item_currency = 'CUP' THEN v_cost * v_qty ELSE v_cost * v_qty * v_item_rate END;

    -- FIX: use correct column names (price_at_sale, cost_at_sale, price_at_sale_cup)
    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_item_currency, v_price_cup
    );
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id);
END;
$func$;

-- GRANT usando la firma correcta de la nueva función
-- (18 parámetros: uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamptz, numeric, numeric, text, text, numeric, numeric)
GRANT EXECUTE ON FUNCTION public.create_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. FIX: Purge automático de store_reset_snapshots (>30 días)
-- Función para limpiar snapshots antiguos. Llamar desde cron o endpoint.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_old_reset_snapshots(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.store_reset_snapshots WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_reset_snapshots(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_reset_snapshots(INTEGER) TO service_role;

-- Ejecutar purge inicial (limpiar snapshots >30 días existentes)
SELECT public.purge_old_reset_snapshots(30) AS snapshots_purged;

-- ──────────────────────────────────────────────────────────────────────────
-- COMENTARIOS
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.create_transfer(UUID, UUID, JSONB, TEXT, TIMESTAMPTZ) IS
'V1.1: Ahora valida stock suficiente en tienda origen con FOR UPDATE. Lanza ERR_INSUFFICIENT_STOCK si no hay stock.';

COMMENT ON FUNCTION public.purge_old_reset_snapshots(INTEGER) IS
'V1.1: Elimina snapshots de reset anteriores a p_days días. Default 30 días.';
