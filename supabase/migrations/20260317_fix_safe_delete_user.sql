-- Migration: Fix Safe User Deletion Functions
-- Corrects column names and table references in can_safely_delete_user

BEGIN;

-- Drop existing functions to handle return type changes
DROP FUNCTION IF EXISTS public.managed_delete_user(UUID);
DROP FUNCTION IF EXISTS public.can_safely_delete_user(UUID);

-- 1. Corrected safety check function
CREATE OR REPLACE FUNCTION public.can_safely_delete_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_records BOOLEAN;
BEGIN
    -- Check Sales (as cashier)
    SELECT EXISTS (SELECT 1 FROM public.sales WHERE cashier_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Receipts/Receptions
    SELECT EXISTS (SELECT 1 FROM public.receipts WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Transfers
    SELECT EXISTS (SELECT 1 FROM public.transfers WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Adjustments
    SELECT EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Cash Closures
    SELECT EXISTS (SELECT 1 FROM public.cash_closures WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Movements
    SELECT EXISTS (SELECT 1 FROM public.inventory_movements WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 2. Corrected managed delete RPC
CREATE OR REPLACE FUNCTION public.managed_delete_user(p_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    -- Security Check: Allow if service role (auth.uid() is null) or if current user is admin
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Solo los administradores pueden eliminar usuarios.';
    END IF;

    -- Cannot delete self
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ERR_CANNOT_DELETE_SELF: No puedes eliminar tu propio usuario.';
    END IF;

    -- Safety Check
    IF NOT public.can_safely_delete_user(p_user_id) THEN
        RAISE EXCEPTION 'ERR_USER_HAS_RECORDS: El usuario tiene registros operativos y no puede ser eliminado por integridad de datos. Se recomienda desactivarlo.';
    END IF;

    -- Perform deletion (Cascades to memberships and other metadata)
    -- We explicitly delete memberships first just in case
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;

    -- Deleting from profiles
    DELETE FROM public.profiles WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Perfil de usuario eliminado correctamente.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

COMMIT;
