-- ══════════════════════════════════════════════════════════════════════
-- F-20 G4 — create_purchase_order v2.24.0 (versión final consolidada)
-- Hallazgos cubiertos:
--   Alto #7 (UNIQUE po_number — implementado en G1, usado aquí)
--   Medio #9 (producto existe en store)
--   Medio #10 (supplier existe FK)
-- Condiciones del usuario:
--   #1: unit_cost > 0 (no 0, porque register_reception B4 rechaza cost <= 0)
--   #1: todo item debe tener product_id NOT NULL → ERR_PRODUCT_ID_REQUIRED
-- ══════════════════════════════════════════════════════════════════════

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
  v_po_id       uuid;
  v_total       numeric := 0;
  v_item        jsonb;
  v_item_count  integer := 0;
  v_product_id  uuid;
  v_count       integer;
  v_po_number   text;
BEGIN
  -- ─── 1. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. Validar supplier_name (parity B2 register_reception) ───
  IF p_supplier_name IS NULL OR p_supplier_name = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  -- ─── 3. Validar supplier_id si se provee (Medio #10) ───
  IF p_supplier_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM public.suppliers
    WHERE id = p_supplier_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_NOT_FOUND: supplier % not in store % or inactive',
        p_supplier_id, p_store_id;
    END IF;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Auto-generar po_number si no viene (Alto #7 complemento) ───
  IF p_po_number IS NULL OR p_po_number = '' THEN
    -- Formato: PO-{store_id_short}-{YYYYMMDD}-{random6}
    SELECT 'PO-' || substr(p_store_id::text, 1, 8) || '-' ||
           to_char(now(), 'YYYYMMDD') || '-' ||
           substr(md5(random()::text), 1, 6)
      INTO v_po_number;
  ELSE
    v_po_number := p_po_number;
    -- Verificar UNIQUE (store_id, po_number) — race-safe vía UNIQUE INDEX
    SELECT COUNT(*) INTO v_count
    FROM public.purchase_orders
    WHERE store_id = p_store_id AND po_number = v_po_number;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'ERR_PO_NUMBER_DUPLICATE: % already exists in store %',
        v_po_number, p_store_id;
    END IF;
  END IF;

  -- ─── 6. Calcular total + validar items ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_count := v_item_count + 1;

    -- Validar campos obligatorios del item
    IF (v_item->>'product_name') IS NULL OR (v_item->>'product_name') = '' THEN
      RAISE EXCEPTION 'ERR_ITEM_PRODUCT_NAME_REQUIRED: item %', v_item_count;
    END IF;

    -- Condición #1: product_id REQUIRED (no NULL)
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_count;
    END IF;

    -- Validar quantity_ordered > 0
    IF COALESCE((v_item->>'quantity_ordered')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_QTY_INVALID: item % quantity_ordered must be > 0', v_item_count;
    END IF;

    -- Condición #1: unit_cost > 0 (no >= 0)
    -- register_reception B4 rechaza unit_cost <= 0; si permitimos 0 aquí,
    -- la PO no sería recepcionable.
    IF COALESCE((v_item->>'unit_cost')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_UNIT_COST_INVALID: item % unit_cost must be > 0 (B4 parity)', v_item_count;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, p_store_id;
    END IF;

    v_total := v_total + ((v_item->>'quantity_ordered')::numeric) * ((v_item->>'unit_cost')::numeric);
  END LOOP;

  -- ─── 7. Insertar OC (usa columnas nuevas de G1) ───
  INSERT INTO public.purchase_orders (
    store_id, supplier, supplier_name, supplier_id, po_number,
    status, total_amount, notes, expected_date, created_by
  ) VALUES (
    p_store_id, p_supplier_name, p_supplier_name, p_supplier_id, v_po_number,
    'draft'::public.purchase_status_enum, v_total, p_notes, p_expected_date, p_created_by
  ) RETURNING id INTO v_po_id;

  -- ─── 8. Insertar items ───
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

  -- ─── 9. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_created_by, p_store_id, 'po_created', 'purchase_orders', v_po_id,
    jsonb_build_object(
      'supplier', p_supplier_name,
      'supplier_id', p_supplier_id,
      'po_number', v_po_number,
      'total', v_total,
      'items', v_item_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_id', v_po_id,
    'po_number', v_po_number,
    'total_amount', v_total
  );
END;
$func$;

-- Re-grant
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, text, uuid, text, text, date, uuid, jsonb) TO authenticated;

-- ═══ DOWN ═══
-- Restaurar versión v2.23.0 de create_purchase_order (ver migración 20260627000002_rpc_transaccionales.sql).
