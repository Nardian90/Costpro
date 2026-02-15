-- Migration: Safe User Deletion
-- Implements a robust check for user activity before allowing deletion.
-- Also allows deleting users with role 'costo' as they typically don't have operational records.

BEGIN;

-- 1. Create function to check if user can be safely deleted
CREATE OR REPLACE FUNCTION public.can_safely_delete_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_sales BOOLEAN;
    v_has_receipts BOOLEAN;
    v_has_transfers BOOLEAN;
    v_has_adjustments BOOLEAN;
    v_user_role user_role;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

    -- If role is 'costo', we consider it safe for now unless they somehow created something
    -- (The following checks will catch it anyway)

    -- Check Sales (as cashier)
    SELECT EXISTS (SELECT 1 FROM public.sales WHERE cashier_id = p_user_id) INTO v_has_sales;
    IF v_has_sales THEN RETURN FALSE; END IF;

    -- Check Receipts/Receptions
    SELECT EXISTS (SELECT 1 FROM public.receipts WHERE user_id = p_user_id) INTO v_has_receipts;
    IF v_has_receipts THEN RETURN FALSE; END IF;

    -- Check Transfers
    SELECT EXISTS (SELECT 1 FROM public.transfers WHERE created_by = p_user_id) INTO v_has_transfers;
    IF v_has_transfers THEN RETURN FALSE; END IF;

    -- Check Inventory Adjustments
    SELECT EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE created_by = p_user_id) INTO v_has_adjustments;
    IF v_has_adjustments THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create RPC for managed delete
CREATE OR REPLACE FUNCTION public.managed_delete_user(p_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    -- Security Check: Only admins can delete
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Solo los administradores pueden eliminar usuarios.';
    END IF;

    -- Cannot delete self
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ERR_CANNOT_DELETE_SELF: No puedes eliminar tu propio usuario.';
    END IF;

    -- Safety Check
    IF NOT public.can_safely_delete_user(p_user_id) THEN
        RAISE EXCEPTION 'ERR_USER_HAS_RECORDS: El usuario tiene registros operativos (ventas, compras o movimientos) y no puede ser eliminado por integridad de datos. Se recomienda desactivarlo.';
    END IF;

    -- Perform deletion (Cascades to memberships and other metadata)
    -- Note: Profiles table should have ON DELETE CASCADE where appropriate,
    -- but we are being careful by checking records first.

    -- Deleting from profiles will work if p_user_id is in auth.users too?
    -- Actually, to fully delete a user in Supabase, they must be removed from auth.users.
    -- This RPC only handles public schema cleanup. The Edge Function/API will handle auth.users.

    DELETE FROM public.profiles WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Perfil de usuario eliminado correctamente.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
