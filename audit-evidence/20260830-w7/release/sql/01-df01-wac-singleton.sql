-- ============================================================================
-- 01-df01-wac-singleton.sql — W6.2 LAB · DF-01 WAC WRITER SINGLETON
-- Aplicar EXCLUSIVAMENTE sobre clones efímeros (NUNCA v2/v3, NUNCA producción)
-- Diseño: W62-01 §4-6, W62-03 DF-01. Orden: fn_recalc_wac → 12 conversiones →
--         motor B eliminado → guard (AL FINAL, tras convertir escritores).
-- ============================================================================

-- ─── S1.1 Tabla de trazabilidad WAC (INV-15, additive) ───
CREATE TABLE IF NOT EXISTS public.wac_change_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL,
  product_id   uuid NOT NULL,
  wac_before   numeric,
  wac_after    numeric NOT NULL,
  event        text NOT NULL,
  qty_in       numeric,
  uc_in        numeric,
  source_ref   jsonb,
  changed_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wac_change_log_prod_idx ON public.wac_change_log (store_id, product_id, created_at);

-- ─── S1.2 ESCRITOR ÚNICO fn_recalc_wac (W62-01 §4) ───
CREATE OR REPLACE FUNCTION public.fn_recalc_wac(
  p_store_id   uuid,
  p_product_id uuid,
  p_event      text,
  p_qty_in     numeric,
  p_uc_in      numeric,
  p_source_ref jsonb DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_S        numeric;
  v_ca_prev  numeric;
  v_ca_new   numeric;
BEGIN
  IF p_store_id IS NULL OR p_product_id IS NULL OR p_event IS NULL THEN
    RAISE EXCEPTION 'ERR_WAC_RECALC_ARGS: store/product/event obligatorios';
  END IF;

  SELECT stock_current, cost_average
  INTO v_S, v_ca_prev
  FROM products
  WHERE id = p_product_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: % store %', p_product_id, p_store_id;
  END IF;

  v_S := COALESCE(v_S, 0);
  v_ca_prev := COALESCE(v_ca_prev, 0);

  IF p_qty_in IS NULL OR p_qty_in = 0 THEN
    -- Salida pura / devolución A1 / evento neutro: WAC INVARIANTE
    v_ca_new := v_ca_prev;
  ELSIF p_qty_in > 0 THEN
    -- Entrada: blend canónico D-01: ca_new = (S·ca_prev + q·uc) / (S+q)
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  ELSE
    -- Reversa de entrada (q<0): inversa exacta del blend; exige S+q > 0
    IF v_S + p_qty_in <= 0 THEN
      RAISE EXCEPTION 'ERR_WAC_REVERSE_NEGATIVE_STOCK: S=% q=%', v_S, p_qty_in;
    END IF;
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  END IF;

  -- Token de escritor: válido SOLO durante este UPDATE (re-sellado tras él)
  SET LOCAL app.wac_writer = 'fn_recalc_wac';
  UPDATE products
     SET cost_average = v_ca_new, updated_at = now()
   WHERE id = p_product_id AND store_id = p_store_id;
  SET LOCAL app.wac_writer = '';

  INSERT INTO public.wac_change_log
    (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, changed_by)
  VALUES
    (p_store_id, p_product_id, v_ca_prev, v_ca_new, p_event, p_qty_in, p_uc_in,
     p_source_ref, auth.uid());

  RETURN v_ca_new;
END $fn$;

-- ─── S2. CONVERSIONES (todas las rutas escritoras → fn_recalc_wac; espejo cp eliminado en 5) ───

-- S2.1 confirm_pending_reception (ruta 2: motor A → escritor único)
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_store_id uuid;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_unit_cost_cup numeric;
  v_units_to_add numeric;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
                    v_units_to_add, v_unit_cost_cup,
                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));

    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active', reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END $fn$;

-- S2.2 fn_process_receipt 3-arg (ruta 3: ingesta directa; sin espejo cp; WAC por escritor único)
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_cost numeric;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_stock numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_store_id uuid;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
    END IF;

    INSERT INTO public.receipts (user_id, status, reference_doc)
    VALUES (p_user_id, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::numeric;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            SELECT s.id INTO v_store_id FROM public.stores s ORDER BY s.created_at LIMIT 1;
            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
            VALUES (
                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
                v_new_details->>'image_url', 0, 0, v_store_id)
            RETURNING id INTO v_prod_id;
            v_current_stock := 0; v_current_avg_cost := 0;
        ELSE
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
            END IF;
            SELECT store_id INTO v_store_id FROM public.products WHERE id = v_prod_id;
            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
            FROM public.products WHERE id = v_prod_id FOR UPDATE;
        END IF;

        v_new_stock := COALESCE(v_current_stock,0) + v_qty;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);

        -- DF-01: WAC primero (S_prev) vía escritor único; stock vía MOVIMIENTO canónico
        -- (corrige además el desync products↔inventory del legacy); SIN espejo cost_price (D-02)
        PERFORM public.fn_recalc_wac(v_store_id, v_prod_id, 'direct_ingest', v_qty, v_cost,
                   jsonb_build_object('rpc','fn_process_receipt','receipt_id',v_receipt_id));
        PERFORM public.register_stock_movement(
          p_product_id := v_prod_id, p_store_id := v_store_id, p_user_id := p_user_id,
          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
          p_operation_date := now(), p_skip_access_check := TRUE);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END $fn$;

-- S2.3 fn_process_receipt 4-arg (misma doctrina, store explícito)
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_store_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_cost numeric;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_stock numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_store uuid := p_store_id;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
    END IF;

    INSERT INTO public.receipts (user_id, store_id, status, reference_doc)
    VALUES (p_user_id, v_store, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::numeric;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
            VALUES (
                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
                v_new_details->>'image_url', 0, 0, v_store)
            RETURNING id INTO v_prod_id;
            v_current_stock := 0; v_current_avg_cost := 0;
        ELSE
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku AND store_id = v_store;
            IF v_prod_id IS NULL THEN
                SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
            END IF;
            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
            END IF;
            SELECT store_id INTO v_store FROM public.products WHERE id = v_prod_id;
            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
            FROM public.products WHERE id = v_prod_id FOR UPDATE;
        END IF;

        v_new_stock := COALESCE(v_current_stock,0) + v_qty;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);

        -- DF-01: mismo contrato que la 3-arg (WAC primero, movimiento canónico)
        PERFORM public.fn_recalc_wac(v_store, v_prod_id, 'direct_ingest', v_qty, v_cost,
                   jsonb_build_object('rpc','fn_process_receipt4','receipt_id',v_receipt_id));
        PERFORM public.register_stock_movement(
          p_product_id := v_prod_id, p_store_id := v_store, p_user_id := p_user_id,
          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
          p_operation_date := now(), p_skip_access_check := TRUE);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END $fn$;

\echo '01a: fn_recalc_wac + wac_change_log + conversiones reception/ingesta'

-- S2.4 perform_inventory_adjustment (ruta 14: Δ>0 blend vía escritor único; Δ<0 neutro)
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);
  v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);

  IF p_quantity_delta > 0 THEN
    -- DF-01: blend vía escritor único (antes: CASE dentro del UPDATE)
    PERFORM public.fn_recalc_wac(p_store_id, p_product_id, 'adjustment_plus',
                 p_quantity_delta, v_costo_unitario_movimiento,
                 jsonb_build_object('rpc','perform_inventory_adjustment','reason',p_reason));
  END IF;
  -- Δ<0: WAC invariante (correcto por diseño A1/salida pura)

  UPDATE public.products
    SET stock_current = v_nuevo_stock, updated_at = v_effective_date
  WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock,
    'new_cost_average', (SELECT cost_average FROM public.products WHERE id=p_product_id AND store_id=p_store_id));
END $fn$;

-- S2.5 cancel_reception (ruta 17: inversa exacta q<0; base canónica ca_prev, NO cost_price; sin espejo)
CREATE OR REPLACE FUNCTION public.cancel_reception(p_reception_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    FOR v_item IN SELECT product_id, quantity, unit_cost FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        SELECT stock_current INTO v_current_stock
        FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        v_new_stock := COALESCE(v_current_stock,0) - v_item.quantity;

        IF v_new_stock > 0 THEN
            -- DF-01: inversa exacta del blend de la entrada (q<0) vía escritor único.
            -- Antes: base cost_price (defecto) + espejo cp. Compat: stock 0 → WAC último conocido.
            PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_cancel',
                         -v_item.quantity, v_item.unit_cost,
                         jsonb_build_object('rpc','cancel_reception','receipt_id',p_reception_id));
        END IF;

        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_store_id,
            p_user_id := v_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'adjustment',
            p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost
        );
    END LOOP;

    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END $fn$;

-- S2.6 reverse_receipt_v2 (ruta 15: inversa exacta por ítem vía escritor único)
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_current_stock numeric;
  v_new_stock numeric;
  v_unit_cost_cup numeric;
  v_items_processed int := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'active' THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: status=%', v_receipt.status; END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_current_stock FROM public.products WHERE id = v_item.product_id AND store_id = v_receipt.store_id FOR UPDATE;
    v_new_stock := GREATEST(0, COALESCE(v_current_stock,0) - v_item.quantity);

    IF v_new_stock > 0 THEN
      PERFORM public.fn_recalc_wac(v_receipt.store_id, v_item.product_id, 'reception_reverse',
                     -v_item.quantity, v_unit_cost_cup,
                     jsonb_build_object('rpc','reverse_receipt_v2','receipt_id',p_receipt_id));
    END IF;

    UPDATE public.products SET stock_current = v_new_stock, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type, -v_item.quantity, v_unit_cost_cup, 'Reversión recepción: ' || COALESCE(p_reason,''), now(), p_user_id, now());

    v_items_processed := v_items_processed + 1;
  END LOOP;

  UPDATE public.receipts SET status='reversed', reversed_at=now(), reversed_by=p_user_id, reversal_reason=p_reason WHERE id=p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_user_id, v_receipt.store_id, 'RECEIPT_REVERSED_V2', 'receipts', p_receipt_id,
          jsonb_build_object('reason', p_reason, 'items_processed', v_items_processed));

  RETURN jsonb_build_object('status','success','receipt_id',p_receipt_id,'items_processed',v_items_processed);
END $fn$;

-- S2.7 void_reception_with_reversal (ruta 16: inversa exacta vía escritor único)
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_old_stock NUMERIC;
  v_new_stock NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status NOT IN ('active') THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: %', v_receipt.status; END IF;

  FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_old_stock FROM products WHERE id = v_item.product_id AND store_id = v_receipt.store_id FOR UPDATE;
    v_new_stock := GREATEST(0, COALESCE(v_old_stock,0) - v_item.quantity);

    IF v_new_stock > 0 THEN
      PERFORM public.fn_recalc_wac(v_receipt.store_id, v_item.product_id, 'reception_void',
                     -v_item.quantity, v_unit_cost_cup,
                     jsonb_build_object('rpc','void_reception_with_reversal','receipt_id',p_receipt_id));
    END IF;

    UPDATE products SET stock_current = v_new_stock, updated_at = v_effective_date
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type, -v_item.quantity, v_unit_cost_cup, 'Void recepción: ' || COALESCE(p_reason,''), v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status='voided', reversed_at=v_effective_date, reversed_by=p_user_id, reversal_reason=p_reason WHERE id=p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_user_id, v_receipt.store_id, 'RECEIPT_VOIDED_WITH_REVERSAL', 'receipts', p_receipt_id,
          jsonb_build_object('reason', p_reason));
END $fn$;

\echo '01b: conversiones ajuste/cancel/reversas aplicadas'

-- S2.8 receive_production_output 6-arg (ruta 10: WAC vía escritor único; qty numérica; SIN espejo cp)
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_user_id UUID;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_param_hash TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0'; END IF;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items WHERE order_id = p_order_id AND actual_qty > 0;

  -- DF-05: PT nunca entra a 0 sin información válida (INV-06/E')
  IF v_total_materials_cost <= 0 THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: sin materiales server-side validos para orden %', p_order_id;
  END IF;

  v_unit_pt_cost := v_total_materials_cost / p_quantity;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id AND store_id = v_order_store_id FOR UPDATE;

  v_new_stock := COALESCE(v_current_stock,0) + p_quantity;

  -- DF-01: WAC vía escritor único; SIN espejo cost_price (D-02)
  v_new_cost := public.fn_recalc_wac(v_order_store_id, p_product_id, 'production_in',
                   p_quantity, v_unit_pt_cost,
                   jsonb_build_object('rpc','receive_production_output','order_id',p_order_id));

  UPDATE production_orders SET
    output_product_id = p_product_id, output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = v_unit_pt_cost, updated_at = now()
  WHERE id = p_order_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  -- DF-05: qty numérica sin truncamiento (D-11)
  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := p_quantity,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_unit_pt_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id, 'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_unit_pt_cost, 'previous_wac', v_current_cost, 'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object('status','success','new_wac',v_new_cost,'new_stock',v_new_stock,
    'total_materials_cost',v_total_materials_cost);
END $fn$;

-- S2.9 receive_production_output 4-arg (delega en la 6-arg; retorno void preservado del contrato)
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
BEGIN
  PERFORM public.receive_production_output(p_order_id, p_product_id, p_quantity, p_store_id, NULL, NULL);
END $fn$;

-- S2.10 reverse_production_order (ruta 18: inversa exacta vía escritor único; sin espejo)
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_REVERSE'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_reverse',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','reverse_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Reversa producción: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='reversed', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $fn$;

\echo '01c: receive/reverse_produccion convertidos'

-- S2.11 void_closed_production_order (ruta 19: inversa exacta vía escritor único; sin espejo)
CREATE OR REPLACE FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text DEFAULT 'Anulación'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_VOID'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_void',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','void_closed_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Void orden cerrada: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='voided', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $fn$;

-- S2.12 create_devolution v1 10-arg (ruta 6: DEFECTO anti-A1 ELIMINADO — devolución NO toca WAC)
-- Identidad REAL del catálogo: (store, items, reason, original_tx, payment_method, customer_id, customer_name, notes, currency, exchange_rate)
CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_dev_number text;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    COALESCE(p_currency, 'CUP'), COALESCE(p_payment_method, 'cash'), 'completed', p_customer_id, p_customer_name, p_notes, v_caller_uid, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- DF-01: entrada de stock A1 NEUTRA — SIN blend WAC (antes: blend propio L75-85 = defecto)
    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'DEVOLUTION_CREATED', 'devolutions', v_devolution_id,
    jsonb_build_object('devolution_number', v_dev_number, 'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total, 'items_count', jsonb_array_length(p_items), 'wac_neutral_a1', true));

  RETURN jsonb_build_object('status','success','devolution_id',v_devolution_id,
    'devolution_number',v_dev_number,'total_amount',v_total);
END $fn$;

-- ─── S3. MOTOR B ELIMINADO ───
DROP TRIGGER IF EXISTS trg_update_product_wac ON public.receipt_items;
DROP FUNCTION IF EXISTS public.update_product_wac();

-- ─── S4. GUARD: escritor único exigido (W62-01 §5) ───
CREATE OR REPLACE FUNCTION public.w62_guard_wac_writer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF coalesce(current_setting('app.wac_writer', true), '') <> 'fn_recalc_wac' THEN
    RAISE EXCEPTION 'ERR_WAC_SINGLE_WRITER_VIOLATION: UPDATE cost_average sin token (OLD=% NEW=%). Unico escritor: fn_recalc_wac', OLD.cost_average, NEW.cost_average
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_wac_writer ON public.products;
CREATE TRIGGER trg_guard_wac_writer
  BEFORE UPDATE OF cost_average ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.w62_guard_wac_writer();

GRANT SELECT ON public.wac_change_log TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) TO service_role;

\echo '01d: motor B eliminado + guard trg_guard_wac_writer activo — DF-01 aplicado'

-- ─── S5. ENMIENDA W7-D1 (2026-08-30) — cierre del exploit ACL ───
-- Origen: w7-readiness/w7d1-acl-patch.sql (orden GO W7-D1 ACL REMEDIATION + RE-GATE;
--         re-verificado en orden GO W7 FINAL CLOSURE, clon fresco, 182 asserts + 12/12 ACL).
-- Problema (W7-03 §12.2): CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto; el paquete
--         original nunca revocó PUBLIC/anon/authenticated → mutación arbitraria de WAC
--         reproducible (exploit: WAC 100 → 399.6666667 por anon y authenticated).
-- Firma exacta verificada: count(overloads)=1 → REVOKE individual == REVOKE total.
-- Principio de mínimo privilegio: PUBLIC/anon/authenticated = DENY (el writer se invoca
--         INTERNAMENTE por 12 rutinas SECURITY DEFINER owner postgres); service_role = KEEP
--         (GRANT de S4 arriba); postgres = owner.
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM authenticated;

\echo '01e: enmienda W7-D1 aplicada — fn_recalc_wac EXECUTE solo postgres(owner)+service_role'
