
-- ════════════════════════════════════════════════════════════════════
-- RPC TRANSACCIONALES para Purchase Orders y Recepciones
-- ════════════════════════════════════════════════════════════════════
-- Estas funciones reemplazan el Promise.all del cliente/API route
-- con transacciones reales de Postgres (BEGIN/COMMIT atómico).
-- CREATE OR REPLACE FUNCTION no altera tablas ni datos existentes.
-- ════════════════════════════════════════════════════════════════════

-- ═══ 1. create_purchase_order: OC + items en una transacción ═══
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_store_id uuid,
  p_supplier_name text,
  p_supplier_id uuid DEFAULT NULL,
  p_po_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_expected_date date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_po_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_item_count integer := 0;
BEGIN
  -- Validar acceso
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar items
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_NO_ITEMS';
  END IF;

  -- Calcular total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total := v_total + ((v_item->>'quantity_ordered')::numeric) * ((v_item->>'unit_cost')::numeric);
    v_item_count := v_item_count + 1;
  END LOOP;

  -- Insertar OC
  INSERT INTO public.purchase_orders (
    store_id, supplier_name, supplier_id, po_number,
    status, total_amount, notes, expected_date, created_by
  ) VALUES (
    p_store_id, p_supplier_name, p_supplier_id, p_po_number,
    'sent', v_total, p_notes, p_expected_date, p_created_by
  ) RETURNING id INTO v_po_id;

  -- Insertar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.purchase_order_items (
      po_id, product_id, product_name, sku,
      quantity_ordered, quantity_received, unit_cost, unit_of_measure
    ) VALUES (
      v_po_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'sku', ''),
      (v_item->>'quantity_ordered')::numeric,
      0,
      (v_item->>'unit_cost')::numeric,
      COALESCE(v_item->>'unit_of_measure', 'unidad')
    );
  END LOOP;

  -- Auditoría
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_created_by, p_store_id, 'po_created', 'purchase_orders', v_po_id,
    jsonb_build_object('supplier', p_supplier_name, 'total', v_total, 'items', v_item_count)
  );

  RETURN jsonb_build_object('status', 'success', 'po_id', v_po_id, 'total_amount', v_total);
END;
$func$;

-- ═══ 2. receive_against_po: suma atómica + recálculo de status ═══
-- FIX: quantity_received = quantity_received + p_qty (suma, no sobrescribe)
CREATE OR REPLACE FUNCTION public.receive_against_po(
  p_po_id uuid,
  p_received_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_po_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_all_received boolean;
  v_any_received boolean;
  v_new_status text;
BEGIN
  -- Cargar OC con lock
  SELECT store_id, status INTO v_store_id, v_po_status
  FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_NOT_FOUND'; END IF;

  -- Validar acceso
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_po_status = 'cancelled' THEN
    RAISE EXCEPTION 'ERR_PO_CANCELLED';
  END IF;

  -- Procesar cada item: SUMAR cantidad (no sobrescribir)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items) LOOP
    v_item_id := (v_item->>'po_item_id')::uuid;
    v_qty := (v_item->>'quantity_received')::numeric;

    -- FIX: suma atómica, no sobrescribe
    UPDATE public.purchase_order_items
    SET quantity_received = quantity_received + v_qty
    WHERE id = v_item_id AND po_id = p_po_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: %', v_item_id;
    END IF;
  END LOOP;

  -- Recalcular status global
  SELECT
    BOOL_AND(quantity_received >= quantity_ordered),
    BOOL_OR(quantity_received > 0)
  INTO v_all_received, v_any_received
  FROM public.purchase_order_items WHERE po_id = p_po_id;

  v_new_status := CASE
    WHEN v_all_received THEN 'received'
    WHEN v_any_received THEN 'partial'
    ELSE 'sent'
  END;

  -- Actualizar OC
  UPDATE public.purchase_orders
  SET status = v_new_status,
      received_at = CASE WHEN v_new_status = 'received' THEN NOW() ELSE received_at END
  WHERE id = p_po_id;

  -- Auditoría
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'po_received', 'purchase_orders', p_po_id,
    jsonb_build_object('new_status', v_new_status, 'items_received', jsonb_array_length(p_received_items))
  );

  RETURN jsonb_build_object('status', 'success', 'po_status', v_new_status);
END;
$func$;

-- ═══ 3. update_reception_items: actualiza items + recalcula total atómicamente ═══
CREATE OR REPLACE FUNCTION public.update_reception_items(
  p_receipt_id uuid,
  p_item_updates jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_deleted boolean;
  v_new_total numeric := 0;
  v_updated_count integer := 0;
  v_failed_count integer := 0;
BEGIN
  -- Cargar recepción con lock
  SELECT store_id, status INTO v_store_id, v_status
  FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- Validar acceso
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Solo se pueden editar recepciones pendientes
  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    v_item_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_deleted := COALESCE((v_item->>'deleted')::boolean, false);

    IF v_deleted THEN
      DELETE FROM public.receipt_items WHERE id = v_item_id AND receipt_id = p_receipt_id;
      v_updated_count := v_updated_count + 1;
    ELSE
      UPDATE public.receipt_items
      SET quantity = v_qty, unit_cost = v_cost
      WHERE id = v_item_id AND receipt_id = p_receipt_id;

      IF NOT FOUND THEN
        v_failed_count := v_failed_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Recalcular total_cost
  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_new_total
  FROM public.receipt_items WHERE receipt_id = p_receipt_id;

  UPDATE public.receipts SET total_cost = v_new_total, updated_at = NOW()
  WHERE id = p_receipt_id;

  -- Auditoría
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'reception_items_updated', 'receipts', p_receipt_id,
    jsonb_build_object('updated', v_updated_count, 'failed', v_failed_count, 'new_total', v_new_total)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', v_updated_count,
    'failed_count', v_failed_count,
    'new_total', v_new_total
  );
END;
$func$;

-- Grants
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, text, uuid, text, text, date, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_against_po(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_reception_items(uuid, jsonb, uuid) TO authenticated;
