-- Migration: Cash Closures Hardening
-- Date: 2026-02-13
-- Author: Jules

BEGIN;

-- 1. Ensure the cash_closures table exists with the correct schema
CREATE TABLE IF NOT EXISTS public.cash_closures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    store_id uuid NOT NULL REFERENCES public.stores(id),
    session_reference text,
    declared_cash numeric NOT NULL DEFAULT 0,
    declared_vouchers numeric NOT NULL DEFAULT 0,
    system_total numeric NOT NULL DEFAULT 0, -- Legacy field support
    notes text,
    status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'cerrado')),
    created_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    declared_total numeric DEFAULT 0,
    system_expected_total numeric DEFAULT 0,
    difference numeric DEFAULT 0
);

-- 2. Add/Update columns to ensure they are standard numeric columns and not GENERATED ALWAYS
DO $$
BEGIN
    -- Handle status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cash_closures' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.cash_closures ADD COLUMN status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'cerrado'));
    END IF;

    -- Handle declared_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cash_closures' AND column_name = 'declared_total'
    ) THEN
        ALTER TABLE public.cash_closures ADD COLUMN declared_total numeric DEFAULT 0;
    END IF;

    -- Handle system_expected_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cash_closures' AND column_name = 'system_expected_total'
    ) THEN
        ALTER TABLE public.cash_closures ADD COLUMN system_expected_total numeric DEFAULT 0;
    END IF;

    -- Handle difference: This is the column causing the "cannot insert a non-DEFAULT value" error
    -- If it exists as a generated column, we must drop it and recreate it.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cash_closures' AND column_name = 'difference'
    ) THEN
        -- We drop and recreate to ensure it's a normal column
        ALTER TABLE public.cash_closures DROP COLUMN difference;
    END IF;
    ALTER TABLE public.cash_closures ADD COLUMN difference numeric DEFAULT 0;

END $$;

-- 3. RLS Policies
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view assigned store closures" ON public.cash_closures;
CREATE POLICY "Users can view assigned store closures" ON public.cash_closures
FOR SELECT TO authenticated
USING (public.has_store_access(store_id));

DROP POLICY IF EXISTS "Users can insert own closures" ON public.cash_closures;
CREATE POLICY "Users can insert own closures" ON public.cash_closures
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.has_store_access(store_id));

DROP POLICY IF EXISTS "Managers and Admins can update closures" ON public.cash_closures;
CREATE POLICY "Managers and Admins can update closures" ON public.cash_closures
FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'encargado'::user_role]));

-- 4. RPC to get sales since last closure
CREATE OR REPLACE FUNCTION public.get_sales_since_last_closure(p_store_id uuid)
RETURNS TABLE(
    total_sales numeric,
    total_cash numeric,
    total_transfer numeric,
    last_closure_at timestamptz
) AS $$
DECLARE
    v_last_closure_at timestamptz;
BEGIN
    -- Find the last CLOSED closure for this store
    SELECT created_at INTO v_last_closure_at
    FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'cerrado'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no closure found, default to start of current day
    IF v_last_closure_at IS NULL THEN
        v_last_closure_at := date_trunc('day', now());
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
        v_last_closure_at AS last_closure_at
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_last_closure_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMIT;
