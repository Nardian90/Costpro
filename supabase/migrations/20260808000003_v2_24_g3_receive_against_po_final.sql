-- ══════════════════════════════════════════════════════════════════════
-- F-20 G3 — receive_against_po v2.24.0 (versión final consolidada)
-- Hallazgos cubiertos:
--   Crítico #2 (cast text→enum)
--   Crítico #3 (sin integración inventario/WAC/receipt)
--   Alto #5 (over-receive check)
--   Medio #6 (negative receive check)
--   Medio #9 (producto existe en store)
-- Condiciones del usuario:
--   #1: Todo item debe tener product_id NOT NULL → ERR_PRODUCT_ID_REQUIRED
--   #3: Si p_invoice_number viene vacío/NULL → pasar NULL a register_reception
--       (evitar colisión UNIQUE (store_id, reference_doc))
--   #5: Ordenar items por po_item_id antes de FOR UPDATE (anti-deadlock)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.receive_against_po(
  p_po_id uuid,
  p_received_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_reception_date timestamptz DEFAULT now(),
  p_invoice_number text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id            uuid;
  v_supplier_name       text;
  v_po_status           public.purchase_status_enum;
  v_item                jsonb;
  v_item_id             uuid;
  v_qty                 numeric;
  v_qty_ordered         numeric;
  v_qty_received_before numeric;
  v_product_id          uuid;
  v_unit_cost           numeric;
  v_product_name        text;
  v_all_received        boolean;
  v_any_received        boolean;
  v_new_status          public.purchase_status_enum;
  v_receipt_id          uuid;
  v_reception_items     jsonb := '[]'::jsonb;
  v_count               integer := 0;
  v_po_number           text;
  v_invoice_to_pass     text;
  v_sorted_items        jsonb;
BEGIN
  -- ─── 1. Cargar OC con lock exclusivo ───
  SELECT po.store_id, po.supplier_name, po.status, po.po_number
    INTO v_store_id, v_supplier_name, v_po_status, v_po_number
  FROM public.purchase_orders po
  WHERE po.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware via has_store_access) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Validar estado de la OC ───
  IF v_po_status = 'cancelled' THEN
    RAISE EXCEPTION 'ERR_PO_CANCELLED';
  END IF;
  -- Solo se puede recibir contra draft, sent o partial.
  IF v_po_status NOT IN ('draft', 'sent', 'partial') THEN
    RAISE EXCEPTION 'ERR_PO_NOT_RECEIVABLE: status % is terminal', v_po_status;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_received_items IS NULL OR jsonb_array_length(p_received_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Condición #5 (anti-deadlock): Ordenar items por po_item_id ASC ───
  SELECT jsonb_agg(elem ORDER BY (elem->>'po_item_id'))
    INTO v_sorted_items
  FROM jsonb_array_elements(p_received_items) AS elem;

  -- ─── 6. Procesar cada item: VALIDAR antes de actualizar ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := COALESCE((v_item->>'quantity_received')::numeric, 0);

    -- Validar po_item_id presente
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'ERR_ITEM_ID_REQUIRED: missing po_item_id in received_items';
    END IF;

    -- Medio #6: qty > 0
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_NEGATIVE_QTY: qty % for item % must be > 0', v_qty, v_item_id;
    END IF;

    -- Cargar estado actual del item con lock FOR UPDATE
    SELECT product_id, quantity_ordered, quantity_received, unit_cost, product_name
      INTO v_product_id, v_qty_ordered, v_qty_received_before, v_unit_cost, v_product_name
    FROM public.purchase_order_items
    WHERE id = v_item_id AND po_id = p_po_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: %', v_item_id;
    END IF;

    -- Alto #5: over-receive check
    IF (v_qty_received_before + v_qty) > v_qty_ordered THEN
      RAISE EXCEPTION 'ERR_OVER_RECEIVE: item % ordered %, already received %, attempting %',
        v_item_id, v_qty_ordered, v_qty_received_before, v_qty;
    END IF;

    -- Condición #1: todo item debe tener product_id NOT NULL
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_id;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, v_store_id;
    END IF;

    -- Acumular para register_reception (formato esperado: product_id, quantity, unit_cost, moneda, tasa)
    v_reception_items := v_reception_items || jsonb_build_object(
      'product_id',   v_product_id,
      'product_name', v_product_name,
      'quantity',     v_qty,
      'unit_cost',    v_unit_cost,
      'moneda_recepcion', 'CUP',
      'tasa_cambio_recepcion', 1.0
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 7. Condición #3: reference_doc NULL si no viene invoice_number ───
  -- Evita colisión con UNIQUE INDEX idx_receipts_store_reference_doc
  -- (store_id, reference_doc) en partial indexes.
  -- El vínculo real receipt↔PO es receipts.po_id (G6).
  IF p_invoice_number IS NULL OR p_invoice_number = '' THEN
    v_invoice_to_pass := NULL;
  ELSE
    v_invoice_to_pass := p_invoice_number;
  END IF;

  -- ─── 8. Crear receipt vinculado vía register_reception ───
  -- register_reception aplica las 8 validaciones B1-B5 + C1-C3 del v2.23.0
  -- (no se relajan). G6 añade p_po_id opcional.
  v_receipt_id := public.register_reception(
    p_store_id        := v_store_id,
    p_supplier        := v_supplier_name,
    p_reception_date  := p_reception_date,
    p_invoice_number  := v_invoice_to_pass,
    p_items           := v_reception_items,
    p_user_id         := p_user_id,
    p_po_id           := p_po_id
  );

  -- ─── 9. Actualizar quantity_received en purchase_order_items ───
  -- (SECURITY DEFINER bypasses RLS DENY UPDATE de G5)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := (v_item->>'quantity_received')::numeric;

    UPDATE public.purchase_order_items
    SET quantity_received = quantity_received + v_qty
    WHERE id = v_item_id AND po_id = p_po_id;
  END LOOP;

  -- ─── 10. Recalcular status global (cast EXPLÍCITO a enum) ───
  SELECT
    BOOL_AND(quantity_received >= quantity_ordered),
    BOOL_OR(quantity_received > 0)
  INTO v_all_received, v_any_received
  FROM public.purchase_order_items WHERE po_id = p_po_id;

  v_new_status :=
    CASE
      WHEN v_all_received THEN 'received'::public.purchase_status_enum
      WHEN v_any_received THEN 'partial'::public.purchase_status_enum
      ELSE 'sent'::public.purchase_status_enum
    END;

  -- ─── 11. Actualizar OC + vincular receipt en notas ───
  UPDATE public.purchase_orders
  SET status       = v_new_status,
      received_at  = CASE WHEN v_new_status = 'received' THEN NOW() ELSE received_at END,
      notes        = COALESCE(notes, '') ||
                     CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                     '[Receipt ' || v_receipt_id::text || ' linked at ' || NOW()::text || ']'
  WHERE id = p_po_id;

  -- ─── 12. CxP (Grupo 6): marcar receipt con payment_status='unpaid' ───
  -- Solo si aún no está seteado (no sobrescribir si register_reception ya lo puso).
  UPDATE public.receipts
  SET payment_status     = COALESCE(NULLIF(payment_status, ''), 'unpaid'),
      payment_terms_days = COALESCE(payment_terms_days, 30),
      due_date           = COALESCE(due_date, (p_reception_date::date + INTERVAL '30 days')::date)
  WHERE id = v_receipt_id;

  -- ─── 13. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'po_received', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'new_status', v_new_status::text,
      'items_received', v_count,
      'receipt_id', v_receipt_id,
      'po_number', v_po_number,
      'invoice_number', v_invoice_to_pass
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', v_new_status::text,
    'receipt_id', v_receipt_id,
    'items_received', v_count
  );
END;
$func$;

-- Re-grant
GRANT EXECUTE ON FUNCTION public.receive_against_po(uuid, jsonb, uuid, timestamptz, text) TO authenticated;

-- ═══ DOWN ═══
-- Restaurar versión v2.23.0 de receive_against_po (ver migración 20260627000002_rpc_transaccionales.sql).
