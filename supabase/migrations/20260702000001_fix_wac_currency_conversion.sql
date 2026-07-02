-- ============================================================================
-- Migration: 20260702000001_fix_wac_currency_conversion.sql
-- Fix P0: Corregir cálculo de cost_average para respetar tasa_cambio_recepcion
--
-- PROBLEMA: Las RPCs que calculan el costo promedio ponderado (WAC) usan
-- unit_cost directamente SIN multiplicar por tasa_cambio_recepcion. Si una
-- recepción se hace en USD (unit_cost=1, tasa=500), el cost_average queda
-- en 1 en vez de 500. Esto contamina todo el flujo: ventas, reportes de
-- utilidad, análisis de ROI. Error de magnitud ≈500x.
--
-- SOLUCIÓN: Multiplicar unit_cost * COALESCE(tasa_cambio_recepcion, 1.0)
-- en todos los cálculos de WAC y en los INSERT a stock_movements.
--
-- RPCs corregidas:
--   1. confirm_pending_reception — calcula WAC al confirmar recepción
--   2. void_reception_with_reversal — revierte WAC al anular recepción
--   3. register_reception — registra movimiento y total_cost
--   4. perform_inventory_adjustment — añade parámetro p_tasa_cambio
--   5. create_transfer — extiende jsonb_to_recordset con tasa_cambio
--
-- NOTA: receipt_items guarda unit_cost en moneda original (correcto).
--       stock_movements y products.cost_average guardan en CUP (convertido).
-- ============================================================================

-- ── 1. confirm_pending_reception ─────────────────────────────────────────
-- Lee tasa_cambio_recepcion del cursor y la aplica al WAC + stock_movements
DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  -- FIX-P0: validar fecha DESPUÉS de obtener v_store_id (no antes)
  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  -- FIX-P0: leer tasa_cambio_recepcion del cursor
  FOR v_item IN
    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
    FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    -- FIX-P0: convertir unit_cost a CUP usando la tasa de la recepción
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

    -- FIX-P0: WAC usando costo en CUP (no moneda original)
    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
      ELSE v_unit_cost_cup END;

    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    -- FIX-P0: stock_movements con costo en CUP
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;


-- ── 2. void_reception_with_reversal ──────────────────────────────────────
-- Revierte WAC usando tasa_cambio_recepcion
DROP FUNCTION IF EXISTS public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(
  p_receipt_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'Anulacion con reversion',
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  -- FIX-P0: validar fecha DESPUÉS de obtener v_store_id
  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  -- FIX-P0: leer tasa_cambio_recepcion del cursor
  FOR v_item IN
    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
    FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    -- FIX-P0: convertir unit_cost a CUP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;

    IF v_new_stock > 0 AND v_current_stock > 0 THEN
      -- FIX-P0: revertir WAC usando costo en CUP
      v_new_avg := (v_current_stock * v_current_avg - v_item.quantity * v_unit_cost_cup) / v_new_stock;
      IF v_new_avg < 0 THEN v_new_avg := 0; END IF;
    ELSE
      v_new_avg := v_current_avg;
    END IF;

    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    -- FIX-P0: stock_movements con costo en CUP
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'return'::movement_type, -v_item.quantity, v_unit_cost_cup,
            p_reason, v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status = 'voided', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'active';
END;
$function$;


-- ── 3. register_reception ────────────────────────────────────────────────
-- Aplicar v_tasa en register_stock_movement y v_total_cost
DROP FUNCTION IF EXISTS public.register_reception(uuid, text, timestamp with time zone, text, jsonb);
CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamptz DEFAULT now(),
  p_invoice_number text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_user_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    -- FIX-P0: convertir a CUP para cálculos internos
    v_unit_cost_cup := v_unit_cost * v_tasa;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE NOTICE 'Producto % no encontrado o no pertenece a la tienda, saltando', v_product_id;
      CONTINUE;
    END IF;

    -- receipt_items guarda unit_cost en moneda original (correcto)
    INSERT INTO public.receipt_items (
      receipt_id, product_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- FIX-P0: register_stock_movement con costo en CUP
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := v_user_id,
      p_quantity := v_quantity,
      p_movement_type := 'purchase',
      p_reason := p_invoice_number || ' - ' || p_supplier,
      p_unit_cost := v_unit_cost_cup,
      p_sale_id := v_receipt_id,
      p_operation_date := v_effective_date
    );

    -- FIX-P0: v_total_cost en CUP
    v_total_cost := v_total_cost + (v_quantity * v_unit_cost_cup);

    -- FIX-G8: actualizar products.price y price_currency si sale_price viene en el JSON
    IF v_item ? 'sale_price' AND (v_item->>'sale_price') IS NOT NULL THEN
      UPDATE products
      SET price = (v_item->>'sale_price')::NUMERIC,
          price_currency = COALESCE(v_item->>'price_currency', v_moneda, 'CUP'),
          updated_at = v_effective_date
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;
  RETURN v_receipt_id;
END;
$function$;

COMMENT ON FUNCTION public.register_reception IS
  'Registra una recepción con items. Cada item puede tener moneda_recepcion y tasa_cambio_recepcion. unit_cost se guarda en moneda original en receipt_items, pero los movimientos de stock y total_cost se calculan en CUP. Default: CUP/1.0.';


-- ── 4. perform_inventory_adjustment ──────────────────────────────────────
-- Añadir parámetro p_tasa_cambio opcional (DEFAULT 1.0)
DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_user_id uuid,
  p_unit_cost_adjustment numeric DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_tasa_cambio numeric DEFAULT 1.0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_nuevo_costo_total NUMERIC;
  v_nuevo_costo_unitario NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  -- FIX-P0: aplicar tasa_cambio al costo de ajuste si viene en moneda extranjera
  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual) * COALESCE(p_tasa_cambio, 1.0);
    v_nuevo_costo_total := GREATEST(0, (v_stock_actual * v_costo_promedio_actual) - (ABS(p_quantity_delta) * v_costo_unitario_movimiento));
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, 0) * COALESCE(p_tasa_cambio, 1.0);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
  END IF;

  v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_unit_cost := v_costo_unitario_movimiento,
    p_operation_date := v_effective_date
  );

  UPDATE public.products
  SET cost_average = v_nuevo_costo_unitario, updated_at = v_effective_date
  WHERE id = p_product_id;

  UPDATE public.inventory
  SET quantity = v_nuevo_stock, updated_at = v_effective_date
  WHERE store_id = p_store_id AND product_id = p_product_id;

  RETURN jsonb_build_object(
    'new_stock', v_nuevo_stock,
    'new_cost_average', v_nuevo_costo_unitario,
    'movement_cost', v_costo_unitario_movimiento
  );
END;
$function$;


-- ── 5. create_transfer ───────────────────────────────────────────────────
-- Extender jsonb_to_recordset con tasa_cambio y aplicar conversión
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_unit_cost_cup NUMERIC;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id, auth.uid(), p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    -- FIX-P0: leer tasa_cambio del JSON y convertir unit_cost a CUP
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio, 1.0);
        -- transfer_items guarda unit_cost en CUP (convertido) para que el WAC
        -- del destino se calcule correctamente al confirmar la transferencia
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_unit_cost_cup, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;


-- ── Refrescar cache de PostgREST ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Comentarios ──────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.confirm_pending_reception IS
  'Confirma una recepción pendiente. Calcula WAC usando unit_cost * tasa_cambio_recepcion (conversión a CUP). FIX-P0: antes ignoraba la tasa y trataba moneda extranjera como CUP.';
COMMENT ON FUNCTION public.void_reception_with_reversal IS
  'Anula una recepción activa revirtiendo el WAC. Usa unit_cost * tasa_cambio_recepcion para revertir correctamente. FIX-P0.';
COMMENT ON FUNCTION public.perform_inventory_adjustment IS
  'Ajuste de inventario con parámetro opcional p_tasa_cambio (DEFAULT 1.0). FIX-P0: permite ajustes en moneda extranjera.';
COMMENT ON FUNCTION public.create_transfer IS
  'Crea transferencia entre tiendas. Acepta tasa_cambio por item en el JSON. FIX-P0: convierte unit_cost a CUP antes de guardar en transfer_items.';
