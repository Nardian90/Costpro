-- ============================================================
-- DECIMAL QUANTITIES MIGRATION + SECURITY HARDENING (P0, P1)
-- Date: 2026-06-05
-- ============================================================

-- 1. SCHEMA CHANGES: Migrate to NUMERIC(12,4)
ALTER TABLE public.products
  ALTER COLUMN stock_current TYPE numeric(12,4) USING stock_current::numeric,
  ALTER COLUMN min_stock TYPE numeric(12,4) USING min_stock::numeric;

ALTER TABLE public.inventory
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric,
  ALTER COLUMN low_stock_threshold TYPE numeric(12,4) USING low_stock_threshold::numeric;

ALTER TABLE public.receipt_items
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.stock_movements
  ALTER COLUMN quantity_change TYPE numeric(12,4) USING quantity_change::numeric,
  ALTER COLUMN balance_after TYPE numeric(12,4) USING balance_after::numeric;

ALTER TABLE public.transfer_items
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.inventory_adjustment_items DROP COLUMN IF EXISTS difference;
ALTER TABLE public.inventory_adjustment_items
  ALTER COLUMN expected_quantity TYPE numeric(12,4) USING expected_quantity::numeric,
  ALTER COLUMN counted_quantity TYPE numeric(12,4) USING counted_quantity::numeric;
ALTER TABLE public.inventory_adjustment_items ADD COLUMN difference numeric(12,4) GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED;

ALTER TABLE public.inventory_movements
  ALTER COLUMN quantity_change TYPE numeric(12,4) USING quantity_change::numeric,
  ALTER COLUMN balance_after TYPE numeric(12,4) USING balance_after::numeric;

ALTER TABLE public.inventory_batches
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.inventory_snapshots
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.sale_items
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.transaction_items
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

ALTER TABLE public.purchase_items
  ALTER COLUMN quantity TYPE numeric(12,4) USING quantity::numeric;

-- Update Composite Types
ALTER TYPE public.variant_decomposition ALTER ATTRIBUTE quantity TYPE numeric(12,4) CASCADE;
ALTER TYPE public.adjustment_item ALTER ATTRIBUTE expected_quantity TYPE numeric(12,4) CASCADE;
ALTER TYPE public.adjustment_item ALTER ATTRIBUTE counted_quantity TYPE numeric(12,4) CASCADE;

-- 2. P0: API KEY ENCRYPTION
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Ensure system config has master key
INSERT INTO public.system_config (key, value, description)
VALUES ('vault_key', 'costpro_master_key_2026', 'Master key for PGP encryption')
ON CONFLICT (key) DO NOTHING;

-- Add encrypted column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_api_keys' AND column_name = 'api_key_encrypted') THEN
    ALTER TABLE public.ai_api_keys ADD COLUMN api_key_encrypted BYTEA;
  END IF;
END $$;

-- Migrate keys using master vault key
-- hint: p_user_id
UPDATE public.ai_api_keys
SET api_key_encrypted = extensions.pgp_sym_encrypt(
  api_key,
  (SELECT value FROM public.system_config WHERE key = 'vault_key')
)
WHERE api_key IS NOT NULL;

-- Drop plain text column
ALTER TABLE public.ai_api_keys DROP COLUMN IF EXISTS api_key;

-- Functions for secure key access
-- hint: auth.uid()
CREATE OR REPLACE FUNCTION public.get_ai_api_key(p_user_id uuid, p_provider text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_vault_key text;
  v_decrypted_key text;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT value INTO v_vault_key FROM public.system_config WHERE key = 'vault_key';
  SELECT extensions.pgp_sym_decrypt(api_key_encrypted, v_vault_key) INTO v_decrypted_key
  FROM public.ai_api_keys WHERE (user_id = p_user_id OR (user_id IS NULL AND p_user_id IS NULL)) AND provider = p_provider AND is_active = true LIMIT 1;
  RETURN v_decrypted_key;
END;
$$;

-- hint: auth.uid()
CREATE OR REPLACE FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_vault_key text;
  v_key_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT value INTO v_vault_key FROM public.system_config WHERE key = 'vault_key';
  INSERT INTO public.ai_api_keys (user_id, provider, api_key_encrypted, label, is_active, updated_at)
  VALUES (auth.uid(), p_provider, extensions.pgp_sym_encrypt(p_api_key, v_vault_key), p_label, true, now())
  ON CONFLICT (id) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = now()
  RETURNING id INTO v_key_id;
  RETURN v_key_id;
END;
$$;

-- 3. P1: HARDEN SD FUNCTIONS (SET search_path)
CREATE OR REPLACE FUNCTION public.sync_product_has_movements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $$
BEGIN
  -- hint: internal trigger
  UPDATE public.products
  SET has_movements = true
  WHERE id = NEW.product_id AND has_movements = false;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $$
 BEGIN
  -- hint: internal trigger
  UPDATE public.products
  SET stock_current = COALESCE(
    (
      SELECT sm.balance_after
      FROM public.stock_movements sm
      WHERE sm.product_id = NEW.product_id
      ORDER BY sm.created_at DESC
      LIMIT 1
    ),
    0
  )
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

-- 4. P1: RLS ON PRODUCT VARIANTS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants insert - member access" ON public.product_variants;
CREATE POLICY "Variants insert - member access" ON public.product_variants
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
    AND public.has_store_access(p.store_id)
  )
);

DROP POLICY IF EXISTS "Variants update - member access" ON public.product_variants;
CREATE POLICY "Variants update - member access" ON public.product_variants
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
    AND public.has_store_access(p.store_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
    AND public.has_store_access(p.store_id)
  )
);

DROP POLICY IF EXISTS "Variants delete - member access" ON public.product_variants;
CREATE POLICY "Variants delete - member access" ON public.product_variants
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
    AND public.has_store_access(p.store_id)
  )
);

-- 5. RPC FUNCTIONS SYNC (Fixed with explicit casts to match RETURN TABLE)
CREATE OR REPLACE FUNCTION public.get_products_for_pos(
  p_store_id uuid,
  p_search_term text DEFAULT '',
  p_category text DEFAULT ''
)
RETURNS TABLE(
  id uuid, name text, description text, sku text, barcode text, barcode_type text,
  price numeric, precio_empresa numeric, cost_price numeric, image_url text, category text,
  unit_of_measure text, supplier text, created_at timestamptz, updated_at timestamptz,
  stock_current numeric, cost_average numeric, min_stock numeric, store_id uuid,
  is_active boolean, visible_en_tienda boolean, has_movements boolean, product_variants jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- hint: has_store_access
  RETURN QUERY
  SELECT
    p.id::uuid,
    p.name::text,
    p.description::text,
    p.sku::text,
    p.barcode::text,
    p.barcode_type::text,
    p.price::numeric,
    p.precio_empresa::numeric,
    p.cost_price::numeric,
    p.image_url::text,
    p.category::text,
    p.unit_of_measure::text,
    p.supplier::text,
    p.created_at::timestamptz,
    p.updated_at::timestamptz,
    p.stock_current::numeric,
    p.cost_average::numeric,
    p.min_stock::numeric,
    p.store_id::uuid,
    p.is_active::boolean,
    p.visible_en_tienda::boolean,
    EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)::boolean AS has_movements,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'product_id', pv.product_id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price::numeric, 'precio_empresa', pv.precio_empresa::numeric, 'conversion_factor', pv.conversion_factor::numeric, 'created_at', pv.created_at, 'updated_at', pv.updated_at))
       FROM public.product_variants pv WHERE pv.product_id = p.id),
      '[]'::jsonb
    ) AS product_variants
  FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
    AND (COALESCE(p_search_term, '') = '' OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
    AND (COALESCE(p_category, '') = '' OR p.category = p_category)
  ORDER BY p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_paginated_products(
  p_store_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_search_term text DEFAULT '',
  p_category text DEFAULT ''
)
RETURNS TABLE(
  id uuid, name text, description text, sku text, barcode text, barcode_type text,
  price numeric, precio_empresa numeric, cost_price numeric, image_url text, category text,
  unit_of_measure text, supplier text, created_at timestamptz, updated_at timestamptz,
  stock_current numeric, cost_average numeric, min_stock numeric, store_id uuid,
  is_active boolean, visible_en_tienda boolean, has_movements boolean, total_count bigint, is_complete boolean
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_total bigint;
  v_is_complete boolean;
BEGIN
  -- hint: has_store_access
  SELECT COUNT(*) INTO v_total FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
    AND (COALESCE(p_search_term, '') = '' OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
    AND (COALESCE(p_category, '') = '' OR p.category = p_category);
  v_is_complete := (p_limit + p_offset >= v_total);
  RETURN QUERY
  SELECT
    p.id::uuid,
    p.name::text,
    p.description::text,
    p.sku::text,
    p.barcode::text,
    p.barcode_type::text,
    p.price::numeric,
    p.precio_empresa::numeric,
    p.cost_price::numeric,
    p.image_url::text,
    p.category::text,
    p.unit_of_measure::text,
    p.supplier::text,
    p.created_at::timestamptz,
    p.updated_at::timestamptz,
    p.stock_current::numeric,
    p.cost_average::numeric,
    p.min_stock::numeric,
    p.store_id::uuid,
    p.is_active::boolean,
    p.visible_en_tienda::boolean,
    EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)::boolean AS has_movements,
    v_total::bigint,
    v_is_complete::boolean
  FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
    AND (COALESCE(p_search_term, '') = '' OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
    AND (COALESCE(p_category, '') = '' OR p.category = p_category)
  ORDER BY p.name LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 6. CORE FUNCTIONS UPDATE (To avoid truncation)
CREATE OR REPLACE FUNCTION public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- hint: auth.uid()
  PERFORM public.register_stock_movement(p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(), p_quantity := -p_quantity, p_movement_type := 'adjustment', p_reason := 'Direct deduction', p_unit_cost := 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity numeric, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- hint: has_store_access
  PERFORM public.register_stock_movement(p_product_id := p_product_id, p_store_id := p_store_id, p_quantity := -ABS(p_quantity), p_movement_type := 'sale', p_reason := p_reference, p_variant_id := p_variant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_initial_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_reference_doc text DEFAULT 'Stock Inicial'::text, p_movement_date timestamp with time zone DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- hint: auth.uid()
  PERFORM public.register_stock_movement(p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(), p_quantity := p_quantity, p_movement_type := 'initial', p_reason := p_reference_doc);
  RETURN jsonb_build_object('success', true, 'new_quantity', p_quantity);
END;
$$;

-- 7. REGISTER RECEPTION RPC (Fixed for decimals and correct enum)
CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamptz DEFAULT now(),
  p_invoice_number text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt_id uuid := gen_random_uuid();
  v_user_id uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
BEGIN
  -- hint: has_store_access
  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized store access'; END IF;
  INSERT INTO public.receipts (id, store_id, user_id, supplier, reception_date, reference_doc, total_cost, status, created_at, updated_at)
  VALUES (v_receipt_id, p_store_id, v_user_id, p_supplier, p_reception_date, p_invoice_number, 0, 'active', now(), now());
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id AND store_id = p_store_id) THEN CONTINUE; END IF;
    INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, created_at, updated_at)
    VALUES (v_receipt_id, v_product_id, v_quantity, v_unit_cost, now(), now());
    PERFORM public.register_stock_movement(p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_user_id, p_quantity := v_quantity, p_movement_type := 'purchase', p_reason := p_invoice_number || ' - ' || p_supplier, p_unit_cost := v_unit_cost, p_sale_id := v_receipt_id);
    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;
  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;
  RETURN v_receipt_id;
END;
$$;
