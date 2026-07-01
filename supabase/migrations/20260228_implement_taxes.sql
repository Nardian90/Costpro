-- Migration: Implement Tax System
-- Date: 2026-02-28
-- Author: Jules

BEGIN;

-- 1. Create tax_configurations table
CREATE TABLE IF NOT EXISTS public.tax_configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('fixed', 'percentage')),
    value numeric NOT NULL DEFAULT 0,
    min_exempt numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Add tax columns to transactions table
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS applied_taxes jsonb DEFAULT '[]'::jsonb;

-- 3. Seed predefined taxes
-- Note: Using NULL for store_id means it's a global/default tax
INSERT INTO public.tax_configurations (name, type, value, min_exempt, is_active)
VALUES
('IVA 10%', 'percentage', 10, 0, true),
('Impuesto 5% (Exento 3260)', 'percentage', 5, 3260, true)
ON CONFLICT DO NOTHING;

-- 4. Update create_sale RPC to handle taxes
-- Drop old version to ensure signature update
DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb,
  p_applied_taxes jsonb DEFAULT '[]'::jsonb,
  p_tax_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
  v_items_count int;
BEGIN
  -- Validate store access
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  v_items_count := jsonb_array_length(p_items);

  -- 1. Create Transaction
  INSERT INTO public.transactions (
    store_id,
    seller_id,
    total_amount,
    subtotal,
    discount_type,
    discount_value,
    payment_method,
    status,
    applied_taxes,
    tax_amount
  )
  VALUES (
    p_store_id,
    p_seller_id,
    p_total_amount,
    p_subtotal,
    p_discount_type::public.discount_type_enum,
    p_discount_value,
    p_payment_method::public.payment_method_enum,
    'completed'::public.transaction_status,
    p_applied_taxes,
    p_tax_amount
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

    -- Register stock movement
    PERFORM public.register_stock_movement(
      p_product_id := (v_item->>'product_id')::uuid,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -((v_item->>'quantity')::integer),
      p_movement_type := 'sale',
      p_reason := 'POS Checkout #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0)
    );
  END LOOP;

  -- 3. AUDIT LOG for Sale
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (
    p_seller_id,
    'CREATE_SALE',
    'transactions',
    v_transaction_id,
    jsonb_build_object(
        'total_amount', p_total_amount,
        'tax_amount', p_tax_amount,
        'items_count', v_items_count,
        'payment_method', p_payment_method
    ),
    p_store_id
  );

  RETURN v_transaction_id;
END;
$$;

-- 5. RPC to update transaction taxes (decisión del encargado)
CREATE OR REPLACE FUNCTION public.update_transaction_taxes(
    p_transaction_id uuid,
    p_applied_taxes jsonb,
    p_tax_amount numeric,
    p_total_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_tax_amount numeric;
    v_store_id uuid;
BEGIN
    -- Check permissions (only manager or admin)
    IF NOT (public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')) THEN
        RAISE EXCEPTION 'Unauthorized: Only managers can update taxes of confirmed sales';
    END IF;

    SELECT tax_amount, store_id INTO v_old_tax_amount, v_store_id
    FROM public.transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    -- Update transaction
    UPDATE public.transactions
    SET
        applied_taxes = p_applied_taxes,
        tax_amount = p_tax_amount,
        total_amount = p_total_amount,
        updated_at = now()
    WHERE id = p_transaction_id;

    -- Audit Log
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (
        auth.uid(),
        'UPDATE_TRANSACTION_TAXES',
        'transactions',
        p_transaction_id,
        jsonb_build_object('tax_amount', v_old_tax_amount),
        jsonb_build_object('tax_amount', p_tax_amount, 'total_amount', p_total_amount, 'applied_taxes', p_applied_taxes),
        v_store_id
    );

    RETURN true;
END;
$$;

-- Grant permissions
GRANT ALL ON public.tax_configurations TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(uuid, jsonb, numeric, numeric) TO authenticated;

COMMIT;
