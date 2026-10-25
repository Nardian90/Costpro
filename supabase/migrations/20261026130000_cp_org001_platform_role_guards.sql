-- ============================================================================
-- CP-ORG-001 — CIERRE DEFINITIVO: GUARDAS DE ROL DE PLATAFORMA (2026-10-25)
--
-- Defectos corregidos (hallazgos de la auditoría final, verificados contra
-- las definiciones vigentes de 20260820000001):
--
--   1. managed_update_user: CUALQUIER admin podía otorgar el rol
--      'superadmin' (o degradar una cuenta superadmin a cualquier rol) con
--      una sola llamada — violación directa del requisito de la misión
--      («un administrador de organización no pueda convertirse en
--      SuperAdmin mediante una petición manipulada»). Además, cualquiera
--      con permiso podía cambiar su PROPIO rol (auto-escalamiento o
--      auto-bloqueo).
--   2. managed_toggle_user_status: un admin/encargado/manager podía
--      DESACTIVAR la cuenta SuperAdmin de plataforma (vector de bloqueo
--      de la administración global).
--   3. managed_soft_delete_user: un admin ordinario podía dar de baja
--      (anonimizar) la cuenta SuperAdmin de plataforma.
--   4. managed_reset_password: un admin ordinario podía disparar un
--      enlace de recuperación para la cuenta SuperAdmin.
--
-- REGLA ESTABLECIDA (documentada en el expediente CP-ORG-001):
--   · El rol 'superadmin' es un rol de PLATAFORMA. Otorgarlo, retirarlo o
--     tocar la cuenta que lo porta (rol, estado, baja, reset, cualquier
--     campo) SOLO puede hacerlo OTRO SuperAdmin.
--   · Nadie puede cambiar su propio rol vía esta RPC (protección frente a
--     auto-escalamiento y auto-bloqueo).
--   · 'tenant_admin' (admin de tenant auto-provisionado por landing)
--     permanece gestionable por los admin de operación, como hasta ahora:
--     es un rol de NEGOCIO del tenant, no de plataforma.
--
-- Todo es CREATE OR REPLACE (idempotente). Sin cambios de datos.
-- No ejecutar en producción sin la revisión del propietario.
-- ============================================================================

-- ─── 1. managed_update_user — guardas de rol de plataforma y de rol propio ──
CREATE OR REPLACE FUNCTION public.managed_update_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_role public.user_role DEFAULT NULL::user_role,
  p_role_id uuid DEFAULT NULL::uuid,
  p_is_active boolean DEFAULT NULL::boolean,
  p_max_stores_limit int DEFAULT NULL::int,
  p_max_users_limit int DEFAULT NULL::int,
  p_plan plan_t DEFAULT NULL::plan_t,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing — service_role puede pasar p_caller_id explícito
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Validar caller es admin (usa v_caller_uid que ahora NO es spoofable para authenticated)
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can update users.';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED: Cannot deactivate own account.';
  END IF;

  -- CP-ORG-001: la cuenta SuperAdmin de plataforma (CUALQUIER campo) solo
  -- puede modificarse por otro SuperAdmin — coherente con toggle/baja/reset.
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  -- CP-ORG-001: roles de plataforma — el cambio de rol 'superadmin'
  -- (en cualquier dirección) queda reservado a un SuperAdmin, y nadie
  -- puede cambiar su PROPIO rol.
  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    IF p_user_id = v_caller_uid THEN
      RAISE EXCEPTION 'ERR_SELF_ROLE_CHANGE: Cannot change your own role via this RPC.';
    END IF;
    IF (p_role = 'superadmin' OR v_old.role = 'superadmin')
       AND v_caller_role <> 'superadmin' THEN
      RAISE EXCEPTION 'ERR_PLATFORM_ROLE: Only a SuperAdmin can grant or revoke the platform role superadmin.';
    END IF;
  END IF;

  IF p_full_name IS NOT NULL AND p_full_name <> v_old.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('old', v_old.full_name, 'new', p_full_name));
    UPDATE public.profiles SET full_name = p_full_name, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role_id IS NOT NULL AND (v_old.role_id IS NULL OR p_role_id <> v_old.role_id) THEN
    v_changes := v_changes || jsonb_build_object('role_id', jsonb_build_object('old', v_old.role_id, 'new', p_role_id));
    UPDATE public.profiles SET role_id = p_role_id, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_is_active IS NOT NULL AND p_is_active <> v_old.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('old', v_old.is_active, 'new', p_is_active));
    UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_stores_limit IS NOT NULL AND (v_old.max_stores_limit IS NULL OR p_max_stores_limit <> v_old.max_stores_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_stores_limit', jsonb_build_object('old', v_old.max_stores_limit, 'new', p_max_stores_limit));
    UPDATE public.profiles SET max_stores_limit = p_max_stores_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_users_limit IS NOT NULL AND (v_old.max_users_limit IS NULL OR p_max_users_limit <> v_old.max_users_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_users_limit', jsonb_build_object('old', v_old.max_users_limit, 'new', p_max_users_limit));
    UPDATE public.profiles SET max_users_limit = p_max_users_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_plan IS NOT NULL AND p_plan <> v_old.plan THEN
    v_changes := v_changes || jsonb_build_object('plan', jsonb_build_object('old', v_old.plan::text, 'new', p_plan::text));
    UPDATE public.profiles SET plan = p_plan, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'USER_UPDATED',
      jsonb_build_object(
        'full_name', v_old.full_name, 'role', v_old.role::text,
        'is_active', v_old.is_active, 'plan', v_old.plan::text
      ),
      v_changes,
      jsonb_build_object('fields_changed', jsonb_object_keys(v_changes))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'changes', v_changes);
END;
$function$;

-- CP-ORG-001: ACL CERTIFICADA (REM-INV-6, patrón 20260916000002): solo
-- service_role ejecuta estas RPC — las rutas API van con clave de
-- servicio. El acceso directo de authenticated queda revocado (endurece
-- la postura; antes esta migración re-grantaba authenticated por error).
REVOKE EXECUTE ON FUNCTION public.managed_update_user FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_user TO service_role;

COMMENT ON FUNCTION public.managed_update_user IS
  'FIX H-7 anti-spoofing + CP-ORG-001: rol superadmin (dar/quitar) solo por SuperAdmin; nadie cambia su propio rol.';

-- ─── 2. managed_toggle_user_status — cuenta de plataforma protegida ────────
CREATE OR REPLACE FUNCTION public.managed_toggle_user_status(
  p_user_id uuid,
  p_is_active boolean,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin', 'encargado', 'manager') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED';
  END IF;

  SELECT id, is_active, full_name, role INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  -- CP-ORG-001: la cuenta SuperAdmin de plataforma solo puede ser
  -- activada/desactivada por otro SuperAdmin (evita el bloqueo de la
  -- administración global por un admin/encargado ordinario).
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  IF v_old.is_active = p_is_active THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values)
  VALUES (
    v_caller_uid, p_user_id,
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    jsonb_build_object('is_active', v_old.is_active),
    jsonb_build_object('is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$function$;

-- CP-ORG-001: ACL CERTIFICADA (REM-INV-6, patrón 20260916000002): solo
-- service_role ejecuta estas RPC — las rutas API van con clave de
-- servicio. El acceso directo de authenticated queda revocado (endurece
-- la postura; antes esta migración re-grantaba authenticated por error).
REVOKE EXECUTE ON FUNCTION public.managed_toggle_user_status FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status TO service_role;

COMMENT ON FUNCTION public.managed_toggle_user_status IS
  'FIX H-7 anti-spoofing + CP-ORG-001: cuenta superadmin protegida (solo superadmin).';

-- ─── 3. managed_soft_delete_user — cuenta de plataforma protegida ──────────
CREATE OR REPLACE FUNCTION public.managed_soft_delete_user(
  p_user_id uuid,
  p_reason text,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_active_memberships_count int;
  v_anon_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED';
  END IF;

  SELECT id, email, full_name, role, plan, is_active INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  -- CP-ORG-001: un admin ordinario no puede dar de baja la cuenta
  -- SuperAdmin de plataforma (anonimización irreversible).
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  SELECT COUNT(*) INTO v_active_memberships_count
    FROM public.user_store_memberships
    WHERE user_id = p_user_id AND status = 'active';
  IF v_active_memberships_count > 0 THEN
    RAISE EXCEPTION 'ERR_USER_HAS_ACTIVE_MEMBERSHIPS: % active. Revoke memberships first.', v_active_memberships_count;
  END IF;

  v_anon_email := 'deleted+' || substr(p_user_id::text, 1, 8) || '@anonymized.local';

  UPDATE public.profiles SET
    deleted_at = now(),
    deletion_reason = p_reason,
    deleted_by = v_caller_uid,
    is_active = false,
    full_name = '[deleted user]',
    email = v_anon_email,
    ai_api_key = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'USER_SOFT_DELETED',
    jsonb_build_object(
      'email', v_old.email, 'full_name', v_old.full_name,
      'role', v_old.role::text, 'plan', v_old.plan::text, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'email', v_anon_email, 'full_name', '[deleted user]',
      'is_active', false, 'deleted_at', now()
    ),
    jsonb_build_object('reason', p_reason, 'memberships_revoked', v_active_memberships_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'status', 'soft_deleted',
    'note', 'auth.users preserved. API route should ban via auth.admin.updateUser.'
  );
END;
$function$;

-- CP-ORG-001: ACL CERTIFICADA (REM-INV-6, patrón 20260916000002): solo
-- service_role ejecuta estas RPC — las rutas API van con clave de
-- servicio. El acceso directo de authenticated queda revocado (endurece
-- la postura; antes esta migración re-grantaba authenticated por error).
REVOKE EXECUTE ON FUNCTION public.managed_soft_delete_user FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user TO service_role;

COMMENT ON FUNCTION public.managed_soft_delete_user IS
  'FIX H-7 anti-spoofing + CP-ORG-001: cuenta superadmin protegida (solo superadmin).';

-- ─── 4. managed_reset_password — cuenta de plataforma protegida ────────────
CREATE OR REPLACE FUNCTION public.managed_reset_password(
  p_user_id uuid,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_target_email text;
  v_target_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_RESET_BLOCKED';
  END IF;

  SELECT email, role INTO v_target_email, v_target_role
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  -- CP-ORG-001: solo otro SuperAdmin puede disparar la recuperación de la
  -- cuenta SuperAdmin de plataforma.
  IF v_target_role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'PASSWORD_RESET_REQUESTED',
    jsonb_build_object('email', v_target_email, 'method', 'recovery_link')
  );

  RETURN jsonb_build_object('success', true, 'email', v_target_email);
END;
$function$;

-- CP-ORG-001: ACL CERTIFICADA (REM-INV-6, patrón 20260916000002): solo
-- service_role ejecuta estas RPC — las rutas API van con clave de
-- servicio. El acceso directo de authenticated queda revocado (endurece
-- la postura; antes esta migración re-grantaba authenticated por error).
REVOKE EXECUTE ON FUNCTION public.managed_reset_password FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_reset_password TO service_role;

COMMENT ON FUNCTION public.managed_reset_password IS
  'FIX H-7 anti-spoofing + CP-ORG-001: cuenta superadmin protegida (solo superadmin).';
