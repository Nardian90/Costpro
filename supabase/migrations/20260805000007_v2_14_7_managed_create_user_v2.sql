-- ============================================================================
-- Migration: 20260805000007_v2_14_7_managed_create_user_v2.sql
-- Iteración 12 — Fix C-2 regression + Q3 centralización
-- ============================================================================
-- Reemplaza managed_create_user (que perdió audit log en v2.12.x).
-- Añade p_plan parameter, validación de enum, audit log atómico.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_create_user_v2;

CREATE OR REPLACE FUNCTION public.managed_create_user_v2(
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_plan plan_t DEFAULT 'free'::plan_t,
  p_store_id uuid DEFAULT NULL::uuid,
  p_memberships jsonb DEFAULT NULL::jsonb,
  p_max_stores int DEFAULT 0,
  p_max_users int DEFAULT 0,
  p_target_user_id uuid DEFAULT NULL::uuid,
  p_creator_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := COALESCE(p_target_user_id, gen_random_uuid());
  v_role_id uuid;
  v_active_store_id uuid;
  m JSONB;
  v_creator_role public.user_role;
  v_creator_uid uuid := COALESCE(p_creator_id, auth.uid());
BEGIN
  -- Validar caller es admin o encargado
  SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_creator_uid;
  IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
  END IF;

  -- Validar email único (entre perfiles activos)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ERR_EMAIL_ALREADY_EXISTS: %', p_email;
  END IF;

  v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);

  -- Encargado solo puede crear en tiendas que gestiona
  IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
    IF NOT public.has_store_access(v_active_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
    END IF;
  END IF;

  -- Buscar role_id
  SELECT id INTO v_role_id FROM public.roles
    WHERE lower(name) = lower(p_role::text)
       OR (name = 'Cajero' AND p_role = 'clerk')
       OR (name = 'Almacenero' AND p_role = 'warehouse')
       OR (name = 'UserCosto' AND p_role = 'costo')
    LIMIT 1;

  -- INSERT profiles con plan
  INSERT INTO public.profiles (
    id, email, full_name, role, role_id, active_store_id, is_active,
    created_by, max_stores_limit, max_users_limit, plan, created_at, updated_at
  ) VALUES (
    v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true,
    v_creator_uid, p_max_stores, p_max_users, p_plan, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    active_store_id = EXCLUDED.active_store_id,
    plan = EXCLUDED.plan,
    is_active = true,
    deleted_at = NULL,
    deletion_reason = NULL,
    deleted_by = NULL,
    updated_at = now()
  RETURNING id INTO v_user_id;

  -- Procesar memberships
  IF p_memberships IS NOT NULL THEN
    IF v_creator_role != 'admin' AND v_creator_role != 'superadmin' THEN
      DELETE FROM public.user_store_memberships
        WHERE user_id = v_user_id
        AND store_id IN (
          SELECT store_id FROM public.user_store_memberships
          WHERE user_id = v_creator_uid AND role IN ('encargado', 'manager')
        );
    ELSE
      DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
    END IF;

    FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
      IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
        IF v_creator_role IN ('admin', 'superadmin') OR public.has_store_access((m->>'store_id')::UUID) THEN
          INSERT INTO public.user_store_memberships (user_id, store_id, role)
          VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::public.user_role)
          ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
        END IF;
      END IF;
    END LOOP;
  ELSIF p_store_id IS NOT NULL THEN
    INSERT INTO public.user_store_memberships (user_id, store_id, role)
    VALUES (v_user_id, p_store_id, p_role)
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  END IF;

  -- Audit log atómico (regresión C-2 restaurada)
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    v_creator_uid, v_user_id, 'USER_CREATED',
    jsonb_build_object(
      'email', p_email, 'full_name', p_full_name, 'role', p_role::text,
      'plan', p_plan::text, 'active_store_id', v_active_store_id,
      'max_stores', p_max_stores, 'max_users', p_max_users
    ),
    jsonb_build_object('memberships_count', CASE WHEN p_memberships IS NOT NULL THEN jsonb_array_length(p_memberships) ELSE 0 END)
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_create_user_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_create_user_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_create_user_v2 TO service_role;

COMMENT ON FUNCTION public.managed_create_user_v2 IS
  'Iteración 12 (Q3 + C-2 regression fix): Creates user with plan, validates enums, writes audit log atomically. Replaces managed_create_user.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_create_user_v2;
-- ============================================================================
