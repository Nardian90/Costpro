-- ============================================================================
-- VALE DE SALIDA — Schema migration (reproducción fiel del estado DB auditado)
-- ============================================================================
-- Esta migration reproduce EXACTAMENTE el estado de la base de datos auditado
-- en Fase A (introspección completa). Todos los objetos fueron extraídos
-- directamente de la DB actual mediante pg_proc/pg_class/information_schema.
--
-- INCLUYE:
--   1. Enum movement_type: issue_slip_out, issue_slip_reverse
--   2. Tablas: issue_slips, issue_slip_items (con columnas, CHECK, FK, indexes)
--   3. RLS: ENABLE + FORCE en 6 tablas Vale
--   4. RLS policies: issue_slips_store_isolation, issue_slip_items_store_isolation
--   5. RPCs: create_vale_salida (5p + 7p), reverse_vale_salida (3p)
--   6. RPC: withdraw_production_item (9p con V-01 fixes)
--   7. RPC: next_document_number (extendido con vale_salida)
--   8. RPC: auto_kardex_on_stock_movement (mapping issue_slip_out/_reverse)
--   9. Grants: anon DENY, authenticated SELECT, service_role ALL
--  10. REVOKE EXECUTE en RPCs internos (withdraw_production_item, check_idempotency,
--      next_document_number, register_stock_movement, get_table_writable_columns)
--  11. COMMENT ON FUNCTION (trust boundary documentation)
--
-- ORDEN:
--   Esta migration debe ejecutarse DESPUÉS de las migrations de:
--     - production_orders (FK a production_orders.id)
--     - production_order_items (FK a production_order_items.id)
--     - products (FK a products.id)
--     - product_variants (FK a product_variants.id)
--     - stores (FK a stores.id)
--     - profiles (FK a profiles.id)
--     - stock_movements + movement_type enum
--     - document_sequences
--     - idempotency_registry
--     - audit_logs
--     - kardex_entries
--
-- IDEMPOTENCIA: Esta migration usa CREATE OR REPLACE y IF NOT EXISTS donde
-- es posible. ALTER TYPE ADD VALUE no es idempotente en PG <12, pero sí en 12+.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENUM movement_type: agregar issue_slip_out, issue_slip_reverse
-- ============================================================================
-- En PostgreSQL 12+, ALTER TYPE ADD VALUE es idempotente si ya existe.
-- Para mayor seguridad, usamos un bloque DO con verificación.

DO $$
BEGIN
  -- issue_slip_out
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'movement_type' AND e.enumlabel = 'issue_slip_out'
  ) THEN
    ALTER TYPE public.movement_type ADD VALUE 'issue_slip_out' BEFORE 'issue_slip_reverse';
  END IF;
  -- issue_slip_reverse
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'movement_type' AND e.enumlabel = 'issue_slip_reverse'
  ) THEN
    ALTER TYPE public.movement_type ADD VALUE 'issue_slip_reverse';
  END IF;
END $$;

-- ============================================================================
-- 2. TABLA issue_slips
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.issue_slips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  slip_number text NOT NULL,
  status text NOT NULL DEFAULT 'completed'::text,
  production_order_id uuid,
  notes text NOT NULL DEFAULT ''::text,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  voided_at timestamp with time zone,
  voided_by uuid,
  void_reason text,
  tenant_id uuid,
  CONSTRAINT issue_slips_pkey PRIMARY KEY (id),
  CONSTRAINT issue_slips_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'voided'::text, 'reversed'::text])))
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slips_store_id_fkey') THEN
    ALTER TABLE public.issue_slips
      ADD CONSTRAINT issue_slips_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slips_production_order_id_fkey') THEN
    ALTER TABLE public.issue_slips
      ADD CONSTRAINT issue_slips_production_order_id_fkey
      FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slips_created_by_fkey') THEN
    ALTER TABLE public.issue_slips
      ADD CONSTRAINT issue_slips_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slips_voided_by_fkey') THEN
    ALTER TABLE public.issue_slips
      ADD CONSTRAINT issue_slips_voided_by_fkey
      FOREIGN KEY (voided_by) REFERENCES public.profiles(id);
  END IF;
END $$;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS issue_slips_pkey ON public.issue_slips USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS issue_slips_slip_number_store_idx ON public.issue_slips USING btree (slip_number, store_id);
CREATE INDEX IF NOT EXISTS issue_slips_store_idx ON public.issue_slips USING btree (store_id);
CREATE INDEX IF NOT EXISTS issue_slips_production_order_idx ON public.issue_slips USING btree (production_order_id) WHERE (production_order_id IS NOT NULL);

-- ============================================================================
-- 3. TABLA issue_slip_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.issue_slip_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  production_order_item_id uuid,
  quantity numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_slip_items_pkey PRIMARY KEY (id),
  CONSTRAINT issue_slip_items_quantity_check CHECK ((quantity > (0)::numeric))
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slip_items_slip_id_fkey') THEN
    ALTER TABLE public.issue_slip_items
      ADD CONSTRAINT issue_slip_items_slip_id_fkey
      FOREIGN KEY (slip_id) REFERENCES public.issue_slips(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slip_items_product_id_fkey') THEN
    ALTER TABLE public.issue_slip_items
      ADD CONSTRAINT issue_slip_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slip_items_variant_id_fkey') THEN
    ALTER TABLE public.issue_slip_items
      ADD CONSTRAINT issue_slip_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_slip_items_production_order_item_id_fkey') THEN
    ALTER TABLE public.issue_slip_items
      ADD CONSTRAINT issue_slip_items_production_order_item_id_fkey
      FOREIGN KEY (production_order_item_id) REFERENCES public.production_order_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS issue_slip_items_pkey ON public.issue_slip_items USING btree (id);
CREATE INDEX IF NOT EXISTS issue_slip_items_slip_idx ON public.issue_slip_items USING btree (slip_id);
CREATE INDEX IF NOT EXISTS issue_slip_items_product_idx ON public.issue_slip_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS issue_slip_items_po_item_idx ON public.issue_slip_items USING btree (production_order_item_id) WHERE (production_order_item_id IS NOT NULL);

-- ============================================================================
-- 4. RLS: ENABLE + FORCE en 6 tablas Vale
-- ============================================================================
ALTER TABLE public.issue_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_slip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_registry ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.issue_slips FORCE ROW LEVEL SECURITY;
ALTER TABLE public.issue_slip_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_registry FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS issue_slips_store_isolation ON public.issue_slips;
CREATE POLICY issue_slips_store_isolation ON public.issue_slips
  FOR ALL TO authenticated
  USING (store_id = ANY (public.current_user_store_ids()))
  WITH CHECK (store_id = ANY (public.current_user_store_ids()));

DROP POLICY IF EXISTS issue_slip_items_store_isolation ON public.issue_slip_items;
CREATE POLICY issue_slip_items_store_isolation ON public.issue_slip_items
  FOR ALL TO authenticated
  USING (slip_id IN (SELECT id FROM public.issue_slips WHERE store_id = ANY (public.current_user_store_ids())))
  WITH CHECK (slip_id IN (SELECT id FROM public.issue_slips WHERE store_id = ANY (public.current_user_store_ids())));

-- ============================================================================
-- 6. GRANTS + REVOKE
-- ============================================================================
-- issue_slips: authenticated SELECT only, anon no grants, service_role all
REVOKE ALL ON public.issue_slips FROM anon, authenticated;
GRANT SELECT ON public.issue_slips TO authenticated;

-- issue_slip_items
REVOKE ALL ON public.issue_slip_items FROM anon, authenticated;
GRANT SELECT ON public.issue_slip_items TO authenticated;

-- stock_movements
REVOKE ALL ON public.stock_movements FROM anon, authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;

-- production_order_items
REVOKE ALL ON public.production_order_items FROM anon, authenticated;
GRANT SELECT ON public.production_order_items TO authenticated;

-- document_sequences
REVOKE ALL ON public.document_sequences FROM anon, authenticated;
GRANT SELECT ON public.document_sequences TO authenticated;

-- idempotency_registry
REVOKE ALL ON public.idempotency_registry FROM anon, authenticated;
GRANT SELECT ON public.idempotency_registry TO authenticated;

-- ============================================================================
-- 7. RPC create_vale_salida (5p) — caller_uid from auth.uid() only
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_vale_salida(
  p_store_id uuid,
  p_items jsonb,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_uid   uuid;
  v_slip_id      uuid;
  v_slip_number  text;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_po_item_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_param_hash   text;
  v_existing     jsonb;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_order_status text;
  v_po_product   uuid;
  v_po_variant   uuid;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- C-02: Idempotency key required
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', NULL, v_param_hash);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_production_order_id IS NOT NULL THEN
    SELECT status INTO v_order_status
    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
    IF v_order_status NOT IN ('approved','in_progress') THEN
      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
    END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (store_id, slip_number, production_order_id, notes, created_by, tenant_id)
  VALUES (p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
    (SELECT tenant_id FROM stores WHERE id = p_store_id))
  RETURNING id INTO v_slip_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN
        RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED';
      END IF;

      IF v_po_item_id = ANY(v_seen_po_items) THEN
        RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id;
      END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;

      IF v_po_product IS DISTINCT FROM v_product_id THEN
        RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH: expected %, got %', v_po_product, v_product_id;
      END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN
        RAISE EXCEPTION 'ERR_VARIANT_MISMATCH: expected %, got %', v_po_variant, v_variant_id;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM withdraw_production_item(
        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
        p_server_side_cost := TRUE
      );
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));

  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END;
$function$;

-- ============================================================================
-- 8. RPC create_vale_salida (7p) — service_role pattern (p_user_id from JWT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_vale_salida(
  p_store_id uuid,
  p_items jsonb,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_uid   uuid;
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_po_item_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_param_hash   text;
  v_existing     jsonb;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_order_status text;
  v_po_product   uuid;
  v_po_variant   uuid;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_production_order_id IS NULL THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_production_order_id IS NOT NULL THEN
    SELECT status INTO v_order_status
    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
    IF v_order_status NOT IN ('approved','in_progress') THEN
      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
    END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, created_by, tenant_id)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
    (SELECT tenant_id FROM stores WHERE id = p_store_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM withdraw_production_item(
        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
        p_server_side_cost := TRUE
      );
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));

  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END;
$function$;

-- TRUST BOUNDARY comment
COMMENT ON FUNCTION public.create_vale_salida(uuid, jsonb, uuid, text, text, uuid) IS
'TRUST BOUNDARY: p_user_id DEBE venir del JWT (session.user.id), NUNCA del body del request. El endpoint /api/vale-salida debe derivar store_id de profiles.active_store_id y user_id de session.user.id. Patrones auth.role()=service_role → COALESCE(p_user_id, auth.uid()) solo es seguro si p_user_id nunca es input del cliente.';

-- ============================================================================
-- 9. RPC reverse_vale_salida (3p)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reverse_vale_salida(
  p_slip_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid;
  v_store_id uuid;
  v_slip_number text;
  v_production_order_id uuid;
  v_item RECORD;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                        THEN COALESCE(p_user_id, auth.uid())
                        ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT store_id INTO v_store_id FROM issue_slips WHERE id = p_slip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  IF NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- V-03 DEFENSE 1: status must be 'completed' (no double reversal)
  -- V-03 DEFENSE 2: slip must have at least one original movement (issue_slip_out or production_out)
  -- The second defense is redundant with the first but protects against data corruption
  -- and future modifications that might break the status check.
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id::text = p_slip_id::text
      AND movement_type IN ('issue_slip_out', 'production_out')
  ) THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: no original movement found (issue_slip_out or production_out)';
  END IF;

  UPDATE issue_slips
  SET status = 'reversed',
      voided_at = now(),
      voided_by = v_caller_uid,
      void_reason = p_reason
  WHERE id = p_slip_id
    AND status = 'completed'
  RETURNING slip_number, production_order_id INTO v_slip_number, v_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: status must be completed';
  END IF;

  FOR v_item IN
    SELECT si.product_id, si.variant_id, si.production_order_item_id,
           si.quantity, si.unit_cost
    FROM issue_slip_items si
    WHERE si.slip_id = p_slip_id
    ORDER BY si.created_at
  LOOP
    DECLARE
      v_reverse_type text;
    BEGIN
      IF v_item.production_order_item_id IS NOT NULL THEN
        v_reverse_type := 'production_reverse';
        UPDATE production_order_items
        SET actual_qty = actual_qty - v_item.quantity,
            status = CASE
              WHEN actual_qty - v_item.quantity <= 0 THEN 'pending'
              ELSE 'partial'
            END,
            updated_at = now()
        WHERE id = v_item.production_order_item_id;
      ELSE
        v_reverse_type := 'issue_slip_reverse';
      END IF;

      PERFORM register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := v_store_id,
        p_user_id := v_caller_uid,
        p_quantity := v_item.quantity,
        p_movement_type := v_reverse_type,
        p_sale_id := p_slip_id,
        p_unit_cost := v_item.unit_cost,
        p_reason := 'Reversion Vale de Salida ' || v_slip_number,
        p_notes := COALESCE(p_reason, 'Reversion'),
        p_variant_id := v_item.variant_id,
        p_skip_access_check := TRUE
      );
    END;
  END LOOP;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'REVERSE_VALE_SALIDA', 'issue_slips', p_slip_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'slip_number', v_slip_number,
      'reason', p_reason,
      'reversed_at', now(),
      'production_order_id', v_production_order_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'slip_id', p_slip_id,
    'slip_number', v_slip_number,
    'new_status', 'reversed'
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_vale_salida(uuid, text, uuid) IS
'TRUST BOUNDARY: p_user_id DEBE venir del JWT. p_reason puede venir del body. p_slip_id debe validarse contra store_access_as(session.user.id, issue_slips.store_id).';

-- ============================================================================
-- 10. RPC withdraw_production_item (9p) — with V-01 fixes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_reference_doc text DEFAULT NULL,
  p_server_side_cost boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,'') || '|' || p_server_side_cost::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  -- V-01: SELECT FOR UPDATE reads AND locks budgeted_qty + actual_qty
  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- V-01: Overconsumption check using locked values
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %',
      v_actual, p_qty, v_budgeted;
  END IF;

  -- C-03 + C-04: Server-side cost without fallback
  IF p_server_side_cost THEN
    SELECT cost_average INTO v_real_unit_cost
    FROM products WHERE id = v_product_id AND store_id = v_order_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    IF v_real_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
    END IF;
  ELSE
    v_real_unit_cost := p_unit_cost;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- No integer truncation (fix #3): use p_qty directly
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'server_side_cost', p_server_side_cost,
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$;

-- ============================================================================
-- 11. next_document_number: ensure 'vale_salida' is accepted
-- ============================================================================
-- Already extended in DB audit (Section [13]). We re-create here to ensure
-- the migration is reproducible.
CREATE OR REPLACE FUNCTION public.next_document_number(
  p_store_id uuid,
  p_document_type text,
  p_user_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad
  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    -- Primera vez: INSERT
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    -- Si ON CONFLICT disparó (race condition), re-select
    IF v_next IS NULL THEN
      SELECT last_number INTO v_last
        FROM public.document_sequences
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
        FOR UPDATE;
      v_next := v_last + 1;
      UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
    END IF;
  ELSE
    -- Ya existe: incrementar
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
    WHEN 'vale_salida' THEN 'VS'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

-- ============================================================================
-- 12. auto_kardex_on_stock_movement: ensure mapping issue_slip_out/_reverse
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_store_id UUID; v_movement_type TEXT; v_qty NUMERIC; v_unit_cost NUMERIC;
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  v_movement_type := CASE
    WHEN NEW.movement_type IN ('sale', 'void', 'sale_void', 'issue_slip_out') THEN 'out'
    WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
    WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
    WHEN NEW.movement_type = 'return' THEN 'devolution_in'
    WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
    WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
    WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
    WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'
    WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'
    WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'
    WHEN NEW.movement_type = 'issue_slip_reverse' THEN 'in'
    ELSE 'adjustment'
  END;
  v_qty := ABS(NEW.quantity_change);
  v_unit_cost := COALESCE(NEW.unit_cost, 0);
  INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
  SELECT v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
    p.stock_current, p.cost_average, p.stock_current * p.cost_average,
    'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type::text), NEW.created_by
  FROM public.products p WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 13. REVOKE EXECUTE en RPCs internos (hardening H1-H2)
-- ============================================================================
-- withdraw_production_item (both overloads): service_role only
REVOKE EXECUTE ON FUNCTION public.withdraw_production_item(
  uuid, numeric, numeric, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_production_item(
  uuid, numeric, numeric, uuid, uuid, text, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(
  uuid, numeric, numeric, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(
  uuid, numeric, numeric, uuid, uuid, text, uuid, text, boolean
) TO service_role;

-- check_idempotency: service_role only
REVOKE EXECUTE ON FUNCTION public.check_idempotency(
  text, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_idempotency(
  text, text, uuid, text
) TO service_role;

-- next_document_number: service_role only
REVOKE EXECUTE ON FUNCTION public.next_document_number(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(
  uuid, text, uuid
) TO service_role;

-- register_stock_movement: service_role only
REVOKE EXECUTE ON FUNCTION public.register_stock_movement(
  uuid, uuid, numeric, text, text, uuid, uuid, uuid, numeric, text,
  timestamp with time zone, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_movement(
  uuid, uuid, numeric, text, text, uuid, uuid, uuid, numeric, text,
  timestamp with time zone, boolean
) TO service_role;

-- get_table_writable_columns: service_role only
REVOKE EXECUTE ON FUNCTION public.get_table_writable_columns(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_writable_columns(text)
TO service_role;

-- ============================================================================
-- 14. Verification
-- ============================================================================
-- Confirm enum values exist
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'movement_type' AND e.enumlabel IN ('issue_slip_out', 'issue_slip_reverse');
  IF v_count < 2 THEN
    RAISE EXCEPTION 'VALE_SALIDA_MIGRATION_FAILED: enum movement_type missing issue_slip_out or issue_slip_reverse';
  END IF;
END $$;

-- Confirm RLS is FORCED on the 6 Vale tables
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('issue_slips','issue_slip_items','stock_movements','production_order_items','document_sequences','idempotency_registry')
    AND c.relrowsecurity = true AND c.relforcerowsecurity = true;
  IF v_count < 6 THEN
    RAISE EXCEPTION 'VALE_SALIDA_MIGRATION_FAILED: RLS not forced on all 6 Vale tables';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- End of migration
-- ============================================================================
