-- Cleanup remaining broad RLS policies found after production verification.
-- These policies overlap with the hardened operation-specific policies and
-- weaken tenant isolation because permissive RLS policies are OR-combined.

BEGIN;

-- products_select_isolated allows any authenticated user to read products with
-- store_id IS NULL and does not enforce tenant/store consistency.
DROP POLICY IF EXISTS "products_select_isolated" ON public.products;

-- Legacy store policies allow any encargado to insert/update stores without
-- requiring creator ownership, active membership, or tenant consistency.
DROP POLICY IF EXISTS "Stores insert" ON public.stores;
DROP POLICY IF EXISTS "Stores update" ON public.stores;

DO $$
DECLARE
  v_remaining text[];
BEGIN
  SELECT array_agg(format('%I.%I:%I', schemaname, tablename, policyname))
  INTO v_remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'products' AND policyname = 'products_select_isolated')
      OR (tablename = 'stores' AND policyname IN ('Stores insert', 'Stores update'))
    );

  IF COALESCE(array_length(v_remaining, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Remaining broad RLS policies were not removed: %', v_remaining;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
