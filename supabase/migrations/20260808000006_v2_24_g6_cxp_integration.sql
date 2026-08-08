-- ══════════════════════════════════════════════════════════════════════
-- F-20 G6 — Integración CxP + extensión register_reception con p_po_id
-- Hallazgos cubiertos: Medio #11 (sin vínculo CxP)
-- Condiciones del usuario:
--   #4: Preservar las 8 validaciones B1-B5 + C1-C3 del hardening v2.23.0
--   #4: DROP FUNCTION de la firma anterior (no overloads)
--   #8: Verificar columnas CxP en receipts (payment_status, paid_amount,
--       payment_terms_days, due_date, paid_at) — todas existen (verificado)
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Añadir columna po_id a receipts (nullable) ───
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS po_id uuid;

-- ─── 2. FK receipts.po_id → purchase_orders.id ON DELETE SET NULL ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_po_id_fkey'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_po_id_fkey
      FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. Index para consultas CxP por PO ───
CREATE INDEX IF NOT EXISTS idx_receipts_po_id
  ON public.receipts (po_id)
  WHERE po_id IS NOT NULL;

-- ─── 4. DROP FUNCTION de la firma anterior (condición #4: no overloads) ───
-- La firma anterior tenía 6 parámetros (sin p_po_id). La nueva tiene 7.
-- DROP específico de la firma antigua para que callers que usan 6 args
-- se resuelvan a la nueva (con default NULL).
DROP FUNCTION IF EXISTS public.register_reception(uuid, text, timestamptz, text, jsonb, uuid);

-- ─── 5. CREATE FUNCTION con nueva firma (7 parámetros, p_po_id al final) ───
-- Las 8 validaciones B+C del v2.23.0 se preservan exactamente.
-- Único cambio: el INSERT en receipts incluye po_id.
CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamptz DEFAULT now(),
  p_invoice_number text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_po_id uuid DEFAULT NULL  -- ← nuevo parámetro opcional
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- B2 (v2.23.0): Supplier is required
  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  -- B3 (v2.23.0): Items array must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id   -- ← nueva columna
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id   -- ← pasa NULL si no viene
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    -- B4 (v2.23.0): Reject items with unit_cost <= 0
    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    -- C1 (v2.23.0): Validate exchange rate is within reasonable range
    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    -- C2 (v2.23.0): Warning if product has expired lots (non-blocking)
    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    -- B5 (v2.23.0): Product must exist in store — RAISE EXCEPTION (not CONTINUE)
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );

    -- A1 WAC HOTFIX (v2.22.0): Path 3 eliminado.
    -- El WAC lo calcula register_stock_movement (Path 2, corregido en A2)
    -- y el trigger trg_update_product_wac (Path 1).

    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id
    ));

  RETURN v_receipt_id;
END
$function$;

-- ─── 6. Re-grant ───
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamptz, text, jsonb, uuid, uuid) TO authenticated;

-- ─── 7. Vista consolidada para CxP ───
CREATE OR REPLACE VIEW public.v_purchase_orders_cxp AS
SELECT
  po.id AS po_id,
  po.po_number,
  po.store_id,
  po.supplier_name,
  po.supplier_id,
  po.status AS po_status,
  po.total_amount AS po_total,
  po.created_at AS po_created_at,
  r.id AS receipt_id,
  r.total_cost AS receipt_total,
  r.payment_status,
  r.paid_amount,
  r.due_date,
  r.payment_terms_days,
  r.paid_at,
  CASE
    WHEN r.payment_status = 'paid' THEN 'settled'
    WHEN r.payment_status = 'partial' THEN 'partial'
    WHEN r.due_date < CURRENT_DATE AND r.payment_status = 'unpaid' THEN 'overdue'
    ELSE 'pending'
  END AS cxp_status,
  (r.total_cost - COALESCE(r.paid_amount, 0)) AS balance_due
FROM public.purchase_orders po
LEFT JOIN public.receipts r ON r.po_id = po.id
WHERE po.status IN ('partial', 'received')
  AND r.id IS NOT NULL;

COMMENT ON VIEW public.v_purchase_orders_cxp IS
  'Vista consolidada Purchase Orders ↔ Receipts para Cuentas por Pagar. Filtra solo POs con recepción.';

GRANT SELECT ON public.v_purchase_orders_cxp TO authenticated;

-- ═══ DOWN ═══
-- DROP VIEW IF EXISTS public.v_purchase_orders_cxp;
-- DROP INDEX IF EXISTS idx_receipts_po_id;
-- ALTER TABLE public.receipts
--   DROP CONSTRAINT IF EXISTS receipts_po_id_fkey,
--   DROP COLUMN IF EXISTS po_id;
-- -- Restaurar register_reception v2.23.0 (firma de 6 parámetros, ver source original)
