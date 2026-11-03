-- ============================================================================
-- USER-MGMT-DELETE-001 — Eliminación administrativa segura de usuarios
-- ============================================================================
-- PROBLEMA (causa raíz del bug reportado):
--   1. La UI enviaba {user_id} sin `reason`; el endpoint exige reason>=3 →
--      TODA eliminación desde la vista devolvía 400 antes de tocar datos.
--   2. managed_soft_delete_user lanza ERR_USER_HAS_ACTIVE_MEMBERSHIPS cuando
--      el usuario tiene tiendas asignadas → el admin no puede eliminar a los
--      usuarios QA con asignaciones (409) y la UI no se lo explicaba.
--   3. No existía un mecanismo administrativo de eliminación DEFINITIVA:
--      e2e_hard_delete_user es SOLO para emails de test (guarda de patrón) y
--      el soft-delete conserva la identidad Auth (baneo 10 años).
--
-- SOLUCIÓN (esta migración):
--   · managed_delete_user_preflight(p_target_id, p_caller_id):
--       inspección SIN efectos: dice qué pasará (auth_present, memberships,
--       dependencias históricas preservadas, bloqueos NOT NULL) y valida
--       guardas. La UI la usa para el diálogo de confirmación.
--   · managed_hard_delete_user(p_target_id, p_reason, p_caller_id):
--       eliminación definitiva administrativa. SOLO superadmin (rol leído
--       del perfil del caller con service_role — no spoofable), nunca a sí
--       mismo, nunca al último superadmin activo, jamás datos comerciales.
--
-- REGLAS DE NEGOCIO (misión §5 — integridad referencial):
--   · Historial COMERCIAL/CONTABLE que se PRESERVA desenlazando la
--     referencia (SET NULL manual, solo en columnas NULLABLE verificadas
--     contra el esquema real): sales.cashier_id, receipts.user_id,
--     devolutions.processed_by/voided_by/reversed_by, production_orders.
--     created_by, kardex_entries.created_by, cost_sheets.created_by,
--     purchase_orders.created_by, inventory_movements.user_id, audit_logs.
--     user_id, payment_transactions.paid_by, telegram/whatsapp_product_posts.
--     published_by, report_runs.executed_by, report_definitions.created_by,
--     tenants.owner_id.
--   · Columnas NOT NULL con FK a profiles (transactions.seller_id,
--     transfers.created_by, inventory_adjustments.created_by,
--     issue_slips.created_by, cash_sessions.cashier_id): BLOQUEAN la
--     eliminación — reescribir la historia contable (SET NULL imposible /
--     DELETE destructivo) está prohibido por la misión. El preflight las
--     lista con conteo para que el admin sepa exactamente qué resolver.
--   · Asignaciones de acceso (user_store_memberships) y datos user-scoped
--     sin valor histórico (preferencias, telemetría, keys): DELETE.
--   · user_audit_log: se PRESERVA (registro de la propia operación).
--   · Identidad auth.users: DELETE (hijos de auth primero).
--
-- IDEMPOTENCIA: repetir la llamada sobre un usuario ya eliminado devuelve
--   success con already_deleted=true (sin error ni inconsistencias).
--
-- ACL: solo service_role (las rutas API van con clave de servicio; acceso
--   directo authenticated revocado — patrón REM-INV-6/CP-ORG-001).
-- ============================================================================

-- ─── 1. PREFLIGHT: inspección sin efectos ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_delete_user_preflight(
  p_target_id uuid,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_profile RECORD;
  v_auth_email text;
  v_active_superadmins int;
  v_memberships jsonb;
  v_preservable jsonb;
  v_blocking jsonb;
BEGIN
  -- Autorización: SOLO superadmin (rol leído del perfil REAL del caller).
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid AND deleted_at IS NULL;
  IF v_caller_role IS NULL OR v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo un SuperAdmin puede eliminar cuentas de usuario (preflight).';
  END IF;

  -- Autoeliminación: bloqueada siempre.
  IF p_target_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED: no puedes eliminar tu propia cuenta.';
  END IF;

  -- Existencia: profile y/o identidad Auth (cuenta parcial).
  SELECT id, email, full_name, role, is_active, deleted_at INTO v_profile
    FROM public.profiles WHERE id = p_target_id;
  SELECT email INTO v_auth_email FROM auth.users WHERE id = p_target_id;

  IF v_profile.id IS NULL AND v_auth_email IS NULL THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: no existe ni profile ni identidad Auth para %.', p_target_id;
  END IF;

  -- Último superadmin: eliminar la ÚLTIMA cuenta superadmin activa dejaría
  -- la plataforma sin administración — bloqueada.
  IF v_profile.role = 'superadmin' AND v_profile.deleted_at IS NULL THEN
    SELECT COUNT(*) INTO v_active_superadmins
      FROM public.profiles
      WHERE role = 'superadmin' AND is_active = true AND deleted_at IS NULL
        AND id <> p_target_id;
    IF v_active_superadmins = 0 THEN
      RAISE EXCEPTION 'ERR_LAST_SUPERADMIN: no puedes eliminar al último SuperAdmin activo.';
    END IF;
  END IF;

  -- Membresías (se eliminan como parte de la operación).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'store_id', m.store_id,
    'store_name', s.name,
    'role', m.role,
    'status', m.status
  ) ORDER BY s.name), '[]'::jsonb) INTO v_memberships
  FROM public.user_store_memberships m
  LEFT JOIN public.stores s ON s.id = m.store_id
  WHERE m.user_id = p_target_id;

  -- Historial que se PRESERVA desenlazando (columnas NULLABLE reales).
  v_preservable := jsonb_build_object(
    'sales_cashier', (SELECT COUNT(*) FROM public.sales WHERE cashier_id = p_target_id),
    'receipts_user', (SELECT COUNT(*) FROM public.receipts WHERE user_id = p_target_id),
    'devolutions_processed_by', (SELECT COUNT(*) FROM public.devolutions WHERE processed_by = p_target_id),
    'devolutions_voided_by', (SELECT COUNT(*) FROM public.devolutions WHERE voided_by = p_target_id),
    'devolutions_reversed_by', (SELECT COUNT(*) FROM public.devolutions WHERE reversed_by = p_target_id),
    'production_orders_created_by', (SELECT COUNT(*) FROM public.production_orders WHERE created_by = p_target_id),
    'kardex_entries_created_by', (SELECT COUNT(*) FROM public.kardex_entries WHERE created_by = p_target_id),
    'cost_sheets_created_by', (SELECT COUNT(*) FROM public.cost_sheets WHERE created_by = p_target_id),
    'purchase_orders_created_by', (SELECT COUNT(*) FROM public.purchase_orders WHERE created_by = p_target_id),
    'inventory_movements_user', (SELECT COUNT(*) FROM public.inventory_movements WHERE user_id = p_target_id),
    'audit_logs_user', (SELECT COUNT(*) FROM public.audit_logs WHERE user_id = p_target_id),
    'payment_transactions_paid_by', (SELECT COUNT(*) FROM public.payment_transactions WHERE paid_by = p_target_id),
    'telegram_posts_published_by', (SELECT COUNT(*) FROM public.telegram_product_posts WHERE published_by = p_target_id),
    'whatsapp_posts_published_by', (SELECT COUNT(*) FROM public.whatsapp_product_posts WHERE published_by = p_target_id),
    'report_runs_executed_by', (SELECT COUNT(*) FROM public.report_runs WHERE executed_by = p_target_id),
    'report_definitions_created_by', (SELECT COUNT(*) FROM public.report_definitions WHERE created_by = p_target_id),
    'tenants_owned', (SELECT COUNT(*) FROM public.tenants WHERE owner_id = p_target_id)
  );

  -- Referencias NOT NULL: NO se pueden desenlazar sin corromper el registro
  -- contable → BLOQUEAN (la misión prohíbe borrar historia para poder borrar
  -- la cuenta). El admin debe reasignar/anular esos registros por sus flujos
  -- de negocio antes de eliminar la cuenta.
  v_blocking := jsonb_build_object(
    'transactions_seller', (SELECT COUNT(*) FROM public.transactions WHERE seller_id = p_target_id),
    'transfers_created_by', (SELECT COUNT(*) FROM public.transfers WHERE created_by = p_target_id),
    'inventory_adjustments_created_by', (SELECT COUNT(*) FROM public.inventory_adjustments WHERE created_by = p_target_id),
    'issue_slips_created_by', (SELECT COUNT(*) FROM public.issue_slips WHERE created_by = p_target_id),
    'cash_sessions_cashier', (SELECT COUNT(*) FROM public.cash_sessions WHERE cashier_id = p_target_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_id', p_target_id,
    'profile_present', v_profile.id IS NOT NULL,
    'profile_deleted_at', v_profile.deleted_at,
    'auth_present', v_auth_email IS NOT NULL,
    'auth_email', v_auth_email,
    'profile_email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'is_active', v_profile.is_active,
    'memberships', v_memberships,
    'business_records_preserved', v_preservable,
    'blocking_dependencies', v_blocking,
    'can_delete',
      (SELECT bool_and((v)::text::int = 0) FROM jsonb_each_text(v_blocking) AS e(k, v)),
    'tenant_owned_warning',
      CASE WHEN (v_preservable->>'tenants_owned')::int > 0
        THEN 'El usuario es propietario de una o más empresas: se conservarán, pero quedarán sin propietario asignado.'
        ELSE NULL END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_delete_user_preflight(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_delete_user_preflight(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.managed_delete_user_preflight(uuid, uuid) IS
  'USER-MGMT-DELETE-001: inspección sin efectos de una eliminación administrativa (solo SuperAdmin).';

-- ─── 2. EJECUCIÓN: eliminación definitiva administrativa ───────────────────
CREATE OR REPLACE FUNCTION public.managed_hard_delete_user(
  p_target_id uuid,
  p_reason text,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_profile RECORD;
  v_auth_email text;
  v_active_superadmins int;
  v_preserved jsonb;
  v_member_count int;
  r record;
BEGIN
  IF COALESCE(p_reason, '') ~ '^\s*$' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: la eliminación administrativa exige una razón.';
  END IF;

  -- Autorización: SOLO superadmin (rol real del perfil, no parámetro cliente).
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid AND deleted_at IS NULL;
  IF v_caller_role IS NULL OR v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo un SuperAdmin puede eliminar cuentas de usuario.';
  END IF;

  IF p_target_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED: no puedes eliminar tu propia cuenta.';
  END IF;

  SELECT id, email, full_name, role, plan, is_active, deleted_at INTO v_profile
    FROM public.profiles WHERE id = p_target_id;
  SELECT email INTO v_auth_email FROM auth.users WHERE id = p_target_id;

  -- IDEMPOTENCIA vs INEXISTENTE: si no queda rastro del usuario, distinguir
  -- (a) fue eliminado antes por este mecanismo → éxito idempotente, de
  -- (b) JAMÁS existió (ni auditoría de eliminación) → 404 claro.
  IF v_profile.id IS NULL AND v_auth_email IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_audit_log
      WHERE target_user_id = p_target_id AND action = 'USER_HARD_DELETED'
    ) THEN
      RETURN jsonb_build_object(
        'success', true, 'already_deleted', true, 'target_id', p_target_id,
        'note', 'El usuario ya fue eliminado (operación idempotente).');
    ELSE
      RAISE EXCEPTION 'ERR_USER_NOT_FOUND: no existe ninguna cuenta con ese identificador (ni perfil ni identidad de acceso ni registro de eliminación previa).';
    END IF;
  END IF;

  IF v_profile.role = 'superadmin' AND v_profile.deleted_at IS NULL THEN
    SELECT COUNT(*) INTO v_active_superadmins
      FROM public.profiles
      WHERE role = 'superadmin' AND is_active = true AND deleted_at IS NULL
        AND id <> p_target_id;
    IF v_active_superadmins = 0 THEN
      RAISE EXCEPTION 'ERR_LAST_SUPERADMIN: no puedes eliminar al último SuperAdmin activo.';
    END IF;
  END IF;

  -- Bloqueos NOT NULL (ver preflight): si hay registros contables con FK
  -- no nullable, la eliminación se BLOQUEA con explicación — no se borra
  -- historia para poder borrar la cuenta.
  IF EXISTS (SELECT 1 FROM public.transactions WHERE seller_id = p_target_id)
     OR EXISTS (SELECT 1 FROM public.transfers WHERE created_by = p_target_id)
     OR EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE created_by = p_target_id)
     OR EXISTS (SELECT 1 FROM public.issue_slips WHERE created_by = p_target_id)
     OR EXISTS (SELECT 1 FROM public.cash_sessions WHERE cashier_id = p_target_id) THEN
    RAISE EXCEPTION 'ERR_BLOCKING_DEPENDENCIES: el usuario tiene registros contables/operativos con referencia obligatoria (ventas, transferencias, ajustes, vales de emisión o sesiones de caja). Reasigna o anula esos registros antes de eliminar la cuenta. La historia comercial no se borra ni se reescribe (USER-MGMT-DELETE-001).';
  END IF;

  -- Snapshot de lo que se preserva (auditoría y respuesta).
  v_preserved := jsonb_build_object(
    'sales_cashier', (SELECT COUNT(*) FROM public.sales WHERE cashier_id = p_target_id),
    'receipts_user', (SELECT COUNT(*) FROM public.receipts WHERE user_id = p_target_id),
    'devolutions_processed_by', (SELECT COUNT(*) FROM public.devolutions WHERE processed_by = p_target_id),
    'production_orders_created_by', (SELECT COUNT(*) FROM public.production_orders WHERE created_by = p_target_id),
    'kardex_entries_created_by', (SELECT COUNT(*) FROM public.kardex_entries WHERE created_by = p_target_id),
    'cost_sheets_created_by', (SELECT COUNT(*) FROM public.cost_sheets WHERE created_by = p_target_id),
    'purchase_orders_created_by', (SELECT COUNT(*) FROM public.purchase_orders WHERE created_by = p_target_id),
    'inventory_movements_user', (SELECT COUNT(*) FROM public.inventory_movements WHERE user_id = p_target_id),
    'audit_logs_user', (SELECT COUNT(*) FROM public.audit_logs WHERE user_id = p_target_id),
    'payment_transactions_paid_by', (SELECT COUNT(*) FROM public.payment_transactions WHERE paid_by = p_target_id),
    'telegram_posts_published_by', (SELECT COUNT(*) FROM public.telegram_product_posts WHERE published_by = p_target_id),
    'whatsapp_posts_published_by', (SELECT COUNT(*) FROM public.whatsapp_product_posts WHERE published_by = p_target_id),
    'report_runs_executed_by', (SELECT COUNT(*) FROM public.report_runs WHERE executed_by = p_target_id),
    'report_definitions_created_by', (SELECT COUNT(*) FROM public.report_definitions WHERE created_by = p_target_id),
    'tenants_owned', (SELECT COUNT(*) FROM public.tenants WHERE owner_id = p_target_id)
  );
  SELECT COUNT(*) INTO v_member_count FROM public.user_store_memberships WHERE user_id = p_target_id;

  -- Deshabilitar SOLO el trigger que impide el DELETE físico de profiles
  -- (política soft-delete del camino de la app; este es el camino
  -- administrativo, con autorización y auditoría propias). Se re-habilita
  -- SIEMPRE (excepción incluida).
  CREATE TEMP TABLE IF NOT EXISTS _mgmt_del_disabled_triggers(table_name text, trg_name text) ON COMMIT DROP;
  DELETE FROM _mgmt_del_disabled_triggers WHERE true;
  FOR r IN
    SELECT t.tgname FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relname = 'profiles'
      AND NOT t.tgisinternal AND t.tgname = 'prevent_hard_delete_profile'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DISABLE TRIGGER %I', r.tgname);
    INSERT INTO _mgmt_del_disabled_triggers VALUES ('public.profiles', r.tgname);
  END LOOP;

  BEGIN
    -- 1) Asignaciones de acceso: memberships (no son historial comercial).
    DELETE FROM public.user_store_memberships WHERE user_id = p_target_id;

    -- 2) Datos user-scoped sin valor histórico.
    DELETE FROM public.user_preferences       WHERE user_id = p_target_id;
    DELETE FROM public.user_usage             WHERE user_id = p_target_id;
    DELETE FROM public.user_progress          WHERE user_id = p_target_id;
    DELETE FROM public.user_strategy_feedback WHERE user_id = p_target_id;
    DELETE FROM public.saved_analytics_views  WHERE user_id = p_target_id;
    DELETE FROM public.ai_api_keys            WHERE user_id = p_target_id;
    DELETE FROM public.idempotency_keys       WHERE user_id = p_target_id;
    DELETE FROM public.bulk_ops_log           WHERE user_id = p_target_id;
    DELETE FROM public.pick3_profiles         WHERE user_id = p_target_id;
    DELETE FROM public.pick3_subscriptions    WHERE user_id = p_target_id;
    DELETE FROM public.pick3_usage            WHERE user_id = p_target_id;
    DELETE FROM public.pick3_user_plays       WHERE user_id = p_target_id;
    DELETE FROM public.pick3_simulations      WHERE user_id = p_target_id;
    DELETE FROM public.wallet_accounts        WHERE user_id = p_target_id;
    DELETE FROM public.sync_log               WHERE user_id = p_target_id;

    -- 3) Historial COMERCIAL: se PRESERVA desenlazando la referencia
    --    (SET NULL manual, solo columnas NULLABLE — ver preflight).
    UPDATE public.sales                   SET cashier_id    = NULL WHERE cashier_id    = p_target_id;
    UPDATE public.receipts                SET user_id       = NULL WHERE user_id       = p_target_id;
    UPDATE public.receipts                SET confirmed_by  = NULL WHERE confirmed_by  = p_target_id;
    UPDATE public.receipts                SET reversed_by   = NULL WHERE reversed_by   = p_target_id;
    UPDATE public.devolutions             SET processed_by  = NULL WHERE processed_by  = p_target_id;
    UPDATE public.devolutions             SET voided_by     = NULL WHERE voided_by     = p_target_id;
    UPDATE public.devolutions             SET reversed_by   = NULL WHERE reversed_by   = p_target_id;
    UPDATE public.production_orders       SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.kardex_entries          SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.cost_sheets             SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.cost_sheet_templates    SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.purchase_orders         SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.inventory_movements     SET user_id       = NULL WHERE user_id       = p_target_id;
    UPDATE public.audit_logs              SET user_id       = NULL WHERE user_id       = p_target_id;
    UPDATE public.payment_transactions    SET paid_by       = NULL WHERE paid_by       = p_target_id;
    UPDATE public.telegram_product_posts  SET published_by  = NULL WHERE published_by  = p_target_id;
    UPDATE public.whatsapp_product_posts  SET published_by  = NULL WHERE published_by  = p_target_id;
    UPDATE public.report_runs             SET executed_by   = NULL WHERE executed_by   = p_target_id;
    UPDATE public.report_definitions      SET created_by    = NULL WHERE created_by    = p_target_id;
    UPDATE public.tenants                 SET owner_id      = NULL WHERE owner_id      = p_target_id;

    -- 4) Profile físico (trigger deshabilitado DENTRO de esta transacción
    --    autorizada; la integridad referencial sigue activa y las referencias
    --    restantes ya se desenlazaron o bloquearon arriba).
    DELETE FROM public.profiles WHERE id = p_target_id;

    -- 5) Identidad Auth (hijos primero por robustez ante cambios del schema).
    DELETE FROM auth.refresh_tokens WHERE user_id = p_target_id::text;
    DELETE FROM auth.sessions       WHERE user_id = p_target_id;
    DELETE FROM auth.identities     WHERE user_id = p_target_id;
    DELETE FROM auth.mfa_factors    WHERE user_id = p_target_id;
    DELETE FROM auth.users          WHERE id = p_target_id;

    -- 6) Auditoría de la operación (user_audit_log no tiene FK a profiles:
    --    el registro sobrevive a la eliminación de ambas cuentas).
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, p_target_id, 'USER_HARD_DELETED',
      jsonb_build_object(
        'email', COALESCE(v_profile.email, v_auth_email),
        'full_name', v_profile.full_name,
        'role', v_profile.role, 'plan', v_profile.plan,
        'is_active', v_profile.is_active
      ),
      jsonb_build_object('deleted', true, 'auth_identity_removed', v_auth_email IS NOT NULL),
      jsonb_build_object(
        'reason', p_reason,
        'memberships_removed', v_member_count,
        'business_records_preserved', v_preserved,
        'mechanism', 'managed_hard_delete_user (USER-MGMT-DELETE-001)'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    FOR r IN SELECT table_name, trg_name FROM _mgmt_del_disabled_triggers LOOP
      BEGIN
        EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
    RAISE;
  END;

  -- Re-habilitar el trigger de soft-delete SIEMPRE.
  FOR r IN SELECT table_name, trg_name FROM _mgmt_del_disabled_triggers LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'target_id', p_target_id,
    'status', 'hard_deleted',
    'auth_identity_removed', v_auth_email IS NOT NULL,
    'memberships_removed', v_member_count,
    'business_records_preserved', v_preserved
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_hard_delete_user(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_hard_delete_user(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.managed_hard_delete_user(uuid, text, uuid) IS
  'USER-MGMT-DELETE-001: eliminación definitiva administrativa (solo SuperAdmin, con auditoría e integridad comercial preservada).';
