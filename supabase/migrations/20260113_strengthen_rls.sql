-- Migration: Strengthen RLS policies
-- Date: 2026-01-13

BEGIN;

-- 1. Create a new, more restrictive role for warehouse staff
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_staff') THEN
    CREATE ROLE warehouse_staff;
  END IF;
END$$;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO warehouse_staff;

-- Grant execute permissions on the necessary functions
GRANT EXECUTE ON FUNCTION public.register_reception_wrapper(jsonb) TO warehouse_staff;
GRANT EXECUTE ON FUNCTION public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer) TO warehouse_staff;

-- 2. Revoke broad permissions from the existing warehouse role
-- Note: It is assumed that 'warehouse' is a role and not a user.
-- If it is a user, you might want to reassign them to the 'warehouse_staff' role.
REVOKE ALL ON TABLE public.products FROM warehouse;
REVOKE ALL ON TABLE public.product_variants FROM warehouse;
-- Add any other tables from which you want to revoke permissions.

-- 3. Apply deny_client_writes policy to all tables that should not be directly modified by clients
DO $$
BEGIN
  -- Inventory: Deny all direct writes.
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='inventory' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.inventory FOR ALL USING (true) WITH CHECK (false);';
  END IF;

  -- Products: Deny all direct writes.
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='products' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.products FOR ALL USING (true) WITH CHECK (false);';
  END IF;

  -- Product Variants: Deny all direct writes.
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='product_variants' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.product_variants FOR ALL USING (true) WITH CHECK (false);';
  END IF;
END$$;

COMMIT;
