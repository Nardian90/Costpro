-- DECLARED FINAL STATE (Git) de managed_create_store
-- fuente: 20260118_multi_store_managed_ops.sql stmt#0

CREATE OR REPLACE FUNCTION public.managed_create_store(
    p_name text,
    p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id uuid;
BEGIN
    INSERT INTO public.stores (name, address, created_by)
    VALUES (p_name, p_address, auth.uid())
    RETURNING id INTO v_store_id;

    -- Note: trigger_auto_assign_store_to_creator handles the access entry.

    RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'message', 'Store created');
END;
$$
