-- E2E DATA HYGIENE (chore/e2e-data-hygiene) — FASE 11/12 (complemento)
-- ============================================================================
-- Hard-delete de un usuario de PRUEBA: profile + identidad Auth.
--
-- POR QUÉ EXISTE:
--   El trigger prevent_hard_delete_profile prohíbe el DELETE físico de
--   profiles (política soft-delete de la app para usuarios REALES). Sin
--   profile no existe vía REST para eliminar la identidad; y GoTrue admin
--   API devuelve 500 (FK profiles_id_fkey) mientras el profile exista.
--   Este helper server-side resuelve el orden para usuarios de TEST.
--
-- GARANTÍAS:
--   1. Solo emails con patrón inequívoco de test (costpro.test / .local /
--      .local-test / fixture). NUNCA emails reales (@gmail etc.).
--   2. Desactiva temporalmente triggers user-level (RI interno sigue activo).
--   3. Limpia filas auth-schema dependientes antes de auth.users.
--   4. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.e2e_hard_delete_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email text;
  v_is_test boolean;
  r record;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN false; -- ya no existe
  END IF;

  -- Serializar con la limpieza de tiendas (mismo lock family)
  PERFORM pg_advisory_xact_lock(918273645);

  -- ── Guarda: solo emails de test ────────────────────────────────────────
  v_is_test := v_email ~* '(@costpro\.test|@costpro-test\.|@costpro\.local|@fixture\.local|@fixture\.costpro|@audit\.costpro\.test|@test\.local|@example\.com|@anonymized\.local|@costpro\.loc$)'
            OR v_email ILIKE 'e2e80-%'
            OR v_email ILIKE 'e2e-%'
            OR v_email ILIKE 'e2e2-%'
            OR v_email ILIKE 'fase-d-%'
            OR v_email ILIKE 'esec-%'
            OR v_email ILIKE 'hot-test-%'
            OR v_email ILIKE 'fc.e2e.%'
            OR v_email ILIKE 'fc-access-e2e-%';
  IF NOT v_is_test THEN
    RAISE EXCEPTION 'E2E_HARD_DELETE_NOT_A_TEST_USER: % no es un email de test', v_email;
  END IF;

  -- ── Desactivar triggers user-level de las tablas afectadas ─────────────
  CREATE TEMP TABLE IF NOT EXISTS _e2e_disabled_triggers_u(table_name text, trg_name text) ON COMMIT DROP;
  DELETE FROM _e2e_disabled_triggers_u WHERE true;

  -- Deshabilitado efectivo (loop correcto)
  FOR r IN
    SELECT n.nspname AS sch, cl.relname AS tbl, t.tgname
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname IN ('public', 'auth')
      AND NOT t.tgisinternal
      AND cl.relname IN ('profiles', 'users')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', r.sch, r.tbl, r.tgname);
      INSERT INTO _e2e_disabled_triggers_u VALUES (r.sch || '.' || r.tbl, r.tgname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  BEGIN
    -- Bypass de trg_validate_payment_invariants: el trigger bloquea TODO
    -- DELETE de payment_transactions salvo current_user postgres/snapshot
    -- restorer + app.restore_mode='true'. SECURITY DEFINER corre como
    -- postgres (owner), así que el toggle LOCAL a la transacción basta.
    -- Patrón canónico: reset_store_data / restore_transaction_snapshot.
    PERFORM set_config('app.restore_mode', 'true', true);

    -- Datos user-scoped (mismo conjunto que e2e/fixtures/hard-cleanup.ts)
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    DELETE FROM public.user_preferences       WHERE user_id = p_user_id;
    DELETE FROM public.user_usage             WHERE user_id = p_user_id;
    DELETE FROM public.user_progress          WHERE user_id = p_user_id;
    DELETE FROM public.user_strategy_feedback WHERE user_id = p_user_id;
    DELETE FROM public.saved_analytics_views  WHERE user_id = p_user_id;
    DELETE FROM public.ai_api_keys            WHERE user_id = p_user_id;
    DELETE FROM public.idempotency_keys       WHERE user_id = p_user_id;
    DELETE FROM public.bulk_ops_log           WHERE user_id = p_user_id;
    DELETE FROM public.pick3_profiles         WHERE user_id = p_user_id;
    DELETE FROM public.pick3_subscriptions    WHERE user_id = p_user_id;
    DELETE FROM public.pick3_usage            WHERE user_id = p_user_id;
    DELETE FROM public.pick3_user_plays       WHERE user_id = p_user_id;
    DELETE FROM public.wallet_accounts        WHERE user_id = p_user_id;
    DELETE FROM public.audit_logs             WHERE user_id = p_user_id;
    DELETE FROM public.cost_sheets            WHERE created_by = p_user_id;
    DELETE FROM public.cost_sheet_templates   WHERE created_by = p_user_id;
    DELETE FROM public.purchase_orders        WHERE created_by = p_user_id;
    DELETE FROM public.report_definitions     WHERE created_by = p_user_id;
    DELETE FROM public.report_runs            WHERE executed_by = p_user_id;
    DELETE FROM public.sync_log               WHERE user_id = p_user_id;
    DELETE FROM public.telegram_product_posts WHERE published_by = p_user_id;
    DELETE FROM public.whatsapp_product_posts WHERE published_by = p_user_id;
    DELETE FROM public.pick3_simulations      WHERE user_id = p_user_id;
    DELETE FROM public.inventory_movements    WHERE user_id = p_user_id;

    -- Cadena v2 (checkout V2): el RPC v1 solo cubría sales/sale_items (v1).
    -- Gap detectado en FASE 2 de e2e-incremental-stabilization: el usuario
    -- qa.h1.sup tenía ventas en transactions (v2) + payment_transactions +
    -- kardex_entries que bloqueaban el DELETE del profile/auth user con
    -- FK violations (23503).
    -- Orden: payment_transactions (FK RESTRICT a transactions) → items →
    -- transactions (seller_id) → kardex_entries.
    DELETE FROM public.payment_transactions
      WHERE paid_by = p_user_id
         OR transaction_id IN (SELECT id FROM public.transactions WHERE seller_id = p_user_id);
    DELETE FROM public.transaction_items
      WHERE transaction_id IN (SELECT id FROM public.transactions WHERE seller_id = p_user_id);
    DELETE FROM public.transactions WHERE seller_id = p_user_id;
    DELETE FROM public.kardex_entries WHERE created_by = p_user_id;

    DELETE FROM public.sale_items             WHERE sale_id IN (SELECT id FROM public.sales WHERE cashier_id = p_user_id);
    DELETE FROM public.sales                  WHERE cashier_id = p_user_id;

    -- Profile (hard delete — solo usuarios de TEST; ver guarda de email)
    DELETE FROM public.profiles WHERE id = p_user_id;

    -- Identidad Auth (auth-schema: hijos primero, FK internos CASCADE)
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
    DELETE FROM auth.sessions       WHERE user_id = p_user_id;
    DELETE FROM auth.identities     WHERE user_id = p_user_id;
    DELETE FROM auth.mfa_factors    WHERE user_id = p_user_id;
    DELETE FROM auth.users          WHERE id = p_user_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers_u LOOP
      BEGIN
        EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
    RAISE;
  END;

  -- Re-habilitar triggers
  FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers_u LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.e2e_hard_delete_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_hard_delete_user(uuid) TO service_role;
