-- DECLARED FINAL STATE (Git) de managed_delete_user
-- fuente: 20260317_fix_safe_delete_user.sql stmt#4

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
