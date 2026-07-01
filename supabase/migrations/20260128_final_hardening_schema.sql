-- Final Hardening Migration for CostPro
-- Closing detected schema gaps and ensuring system integrity
-- Date: 2026-01-28

BEGIN;

-- 1. Ensure Stores have logo_url
ALTER TABLE IF EXISTS public.stores
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Ensure Profiles have roles and active_store_id
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS roles public.user_role[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS active_store_id UUID REFERENCES public.stores(id);

-- 3. Create or Update get_audit_logs RPC for deterministic results
CREATE OR REPLACE FUNCTION public.get_audit_logs(
    p_store_id uuid DEFAULT NULL,
    p_search_term text DEFAULT NULL,
    p_date_from timestamp DEFAULT NULL,
    p_date_to timestamp DEFAULT NULL,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    user_id uuid,
    action text,
    table_name text,
    record_id text,
    old_data jsonb,
    new_data jsonb,
    metadata jsonb,
    store_id uuid,
    store_name text,
    profile jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.created_at,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.old_data,
        al.new_data,
        al.metadata,
        al.store_id,
        s.name as store_name,
        (
            SELECT jsonb_build_object(
                'full_name', p.full_name,
                'role', p.role
            )
            FROM public.profiles p
            WHERE p.id = al.user_id
        ) as profile
    FROM public.audit_logs al
    LEFT JOIN public.stores s ON al.store_id = s.id
    WHERE
        (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR al.action ILIKE ('%' || p_search_term || '%')
            OR al.table_name ILIKE ('%' || p_search_term || '%')
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = al.user_id
                AND p.full_name ILIKE ('%' || p_search_term || '%')
            )
        )
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;

-- 4. Fix create_sale RPC to handle status and movement correctly if not already present
-- (Ensuring idempotency and audit)
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
BEGIN
  -- Validate store access
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 1. Create Transaction
  INSERT INTO public.transactions (
    store_id,
    seller_id,
    total_amount,
    subtotal,
    discount_type,
    discount_value,
    payment_method,
    status
  )
  VALUES (
    p_store_id,
    p_seller_id,
    p_total_amount,
    p_subtotal,
    p_discount_type::public.discount_type_enum,
    p_discount_value,
    p_payment_method::public.payment_method_enum,
    'completed'::public.transaction_status
  )
  RETURNING id INTO v_transaction_id;

  -- 2. Create Transaction Items and Update Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.transaction_items (
      transaction_id,
      product_id,
      variant_id,
      quantity,
      price_at_sale,
      cost_at_sale
    )
    VALUES (
      v_transaction_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric
    );

    -- Register stock movement via the audited function
    PERFORM public.register_stock_movement(
      p_store_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      -((v_item->>'quantity')::integer),
      'sale',
      'Venta #' || substring(v_transaction_id::text from 1 for 8),
      p_seller_id
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

COMMIT;
