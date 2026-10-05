-- ============================================================================
-- FIX DEFECT-1 (42501) — Resolución del actor para la familia
-- costpro_transaction_adjuster (adjust_total_amount + update_transaction_taxes)
-- ============================================================================
-- Defecto demostrado empíricamente en LIVE (reproducido):
--
--   SET ROLE costpro_transaction_adjuster; SELECT auth.uid();
--   → ERROR 42501: permission denied for schema auth
--
-- Causa raíz (dos capas):
--   1. Toda función SECURITY DEFINER cuyo owner es costpro_transaction_adjuster
--      corre con los privilegios de ese rol; su cuerpo llama auth.uid(), y la
--      resolución del nombre exige USAGE sobre el ESQUEMA `auth`.
--   2. La corrección obvia (GRANT USAGE ON SCHEMA auth TO ...) es IMPOSIBLE en
--      la plataforma: el schema `auth` es propiedad de supabase_admin y el ACL
--      está gestionado por el platform (postgres carece de grant options y
--      cualquier GRANT sobre ese schema es ignorado — verificado empíricamente
--      con rol de prueba desechable: el privilegio no aterriza).
--      Por eso el PR #1357 terminó BLOCKED: su plan de fix dependía de un
--      GRANT que la plataforma no permite ejecutar.
--
-- Hecho clave: auth.uid() NO requiere privilegio alguno — su cuerpo es pura
-- lectura de GUCs (request.jwt.claim.sub / request.jwt.claims->>sub). El 42501
-- ocurre únicamente en la RESOLUCIÓN del nombre schema-qualified `auth.uid()`.
--
-- Fix (mínimo y estructural):
--   · Helper public.app_actor_uid() — réplica EXACTA del cuerpo de auth.uid()
--     (misma semántica de coalesce entre las dos GUCs), ubicado en `public`,
--     schema donde costpro_transaction_adjuster YA tiene USAGE verificado.
--   · En las dos funciones de la familia, `v_actor := auth.uid()` pasa a ser
--     `v_actor := public.app_actor_uid()`. Ningún otro cambio de lógica,
--     autorización, auditoría o ACL.
--
-- Seguridad:
--   · El helper devuelve exactamente lo que auth.uid() devolvería para la
--     sesión llamante (el sub del JWT verificado por PostgREST) — sin cambio
--     de superficie de información.
--   · EXECUTE restringido a {authenticated, service_role,
--     costpro_transaction_adjuster}; revocado PUBLIC/anon.
--   · El owner de ambas funciones se conserva (CREATE OR REPLACE no altera
--     ownership): la familia auditada PT008 permanece intacta.
--
-- Verificación post-fix (evidencia en el reporte de la rama):
--   SET ROLE costpro_transaction_adjuster;
--   SELECT public.update_transaction_taxes(<uuid inexistente>, '[]', 'probe');
--   → antes: 42501 permission denied for schema auth
--   → después: ERR_UNAUTHENTICATED (PT014) — pasó la resolución del actor.
-- ============================================================================

-- 1) Helper canónico del actor (réplica de auth.uid(), schema public)
CREATE OR REPLACE FUNCTION public.app_actor_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = 'public', 'pg_temp'
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

REVOKE EXECUTE ON FUNCTION public.app_actor_uid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_actor_uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_actor_uid() TO service_role;
GRANT EXECUTE ON FUNCTION public.app_actor_uid() TO costpro_transaction_adjuster;

-- 2) adjust_total_amount — único cambio: origen del actor (auth.uid → helper)
--    Estado previo verificado == 20260916000001_rem_inv_6 (cadena) == LIVE.
CREATE OR REPLACE FUNCTION public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid; v_old_total numeric; v_store_id uuid; v_paid_total numeric; v_lock_key bigint;
BEGIN
  v_actor := public.app_actor_uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013'; END IF;
  IF p_new_total IS NULL OR p_new_total < 0 THEN RAISE EXCEPTION 'ERR_INVALID_TOTAL' USING ERRCODE = 'PT012'; END IF;
  v_lock_key := hashtextextended(p_transaction_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT total_amount, store_id INTO v_old_total, v_store_id FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016'; END IF;
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total FROM public.payment_transactions WHERE transaction_id = p_transaction_id;
  IF v_paid_total > p_new_total + 0.01 THEN RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS' USING ERRCODE = 'PT002'; END IF;
  IF v_old_total = p_new_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP', 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;
  UPDATE public.transactions SET total_amount = p_new_total WHERE id = p_transaction_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason, 'paid_total_at_time', v_paid_total, 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
  RETURN true;
END;
$function$
;

-- 3) update_transaction_taxes /3 (H0-R §9) — único cambio: origen del actor.
--    Estado previo verificado == 20261004130003_h0r == LIVE.
CREATE OR REPLACE FUNCTION public.update_transaction_taxes(
  p_transaction_id uuid,
  p_applied_taxes  jsonb,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := public.app_actor_uid();
  v_store_id uuid;
  v_status text;
  v_subtotal numeric;
  v_discount numeric;
  v_old_tax numeric;
  v_old_taxes jsonb;
  v_old_total numeric;
  v_paid_total numeric;
  v_base numeric;
  v_new_tax numeric := 0;
  v_new_total numeric;
  v_applied jsonb := '[]'::jsonb;
  v_tax_ids text[] := '{}';
  v_entry jsonb;
  v_tc record;
  v_reason text;
BEGIN
  -- WHO (1): autenticación (PT014)
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
  END IF;

  -- WHICH STORE + WHEN: fila bajo lock; la tienda se lee DE LA TRANSACCIÓN
  SELECT store_id, status::text, subtotal, COALESCE(discount_value, 0),
         tax_amount, applied_taxes, total_amount
    INTO v_store_id, v_status, v_subtotal, v_discount,
         v_old_tax, v_old_taxes, v_old_total
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND: %', p_transaction_id;
  END IF;

  -- WHO (2): autorización por membresía EN LA TIENDA DE LA TRANSACCIÓN
  -- (o admin global). Roles globales sin membresía: DENEGADOS (T-UTT-005).
  IF NOT (
    public.is_admin()
    OR public.has_store_role_as(v_actor, v_store_id, ARRAY['admin', 'manager', 'encargado'])
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- WHEN (estados): solo ventas confirmadas ('pending' | 'completed')
  IF v_status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_STATE: status=% no admite corrección tributaria', v_status;
  END IF;

  -- MOTIVO (PT013): obligatorio 1..500 tras btrim
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_INVALID: max 500 caracteres';
  END IF;

  -- WHAT + HOW: reconstrucción server-side desde tax_configurations (§5.4)
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  v_base := GREATEST(0, v_subtotal - v_discount);
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_entry->>'id' IS NULL OR btrim(v_entry->>'id') = ''
       OR v_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = v_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied := v_applied || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_new_tax := v_new_tax + GREATEST(0, v_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_new_tax := v_new_tax + v_tc.value;
    END IF;
  END LOOP;

  -- Invariante canónica: total = subtotal − descuento + impuesto
  v_new_total := v_subtotal - v_discount + v_new_tax;

  -- INVARIANTE PT002: el pago registrado nunca queda por encima del total
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
    FROM public.payment_transactions
    WHERE transaction_id = p_transaction_id;
  IF v_paid_total > v_new_total + 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: new_total=% < paid=%', v_new_total, v_paid_total
      USING ERRCODE = 'PT002';
  END IF;

  -- NO-OP auditado: nada que mutar
  IF v_new_tax = v_old_tax AND v_applied = v_old_taxes AND v_new_total = v_old_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES ('UPDATE_TRANSACTION_TAXES_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
      jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
      jsonb_build_object('reason', v_reason, 'result', 'NO_OP', 'paid_total_at_time', v_paid_total,
                         'executed_as', current_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;

  -- Mutación (owner costpro_transaction_adjuster: única clase PT008)
  UPDATE public.transactions
    SET applied_taxes = v_applied,
        tax_amount = v_new_tax,
        total_amount = v_new_total,
        updated_at = now()
    WHERE id = p_transaction_id;

  -- AUDIT completa
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
  VALUES ('UPDATE_TRANSACTION_TAXES', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
    jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
    jsonb_build_object('reason', v_reason, 'paid_total_at_time', v_paid_total,
                       'executed_as', current_user, 'auth_uid', v_actor));

  RETURN true;
END;
$function$
;

-- 4) Recarga del schema cache de PostgREST (canal estándar Supabase)
NOTIFY pgrst, 'reload schema';
