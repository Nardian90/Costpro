-- DECLARED FINAL STATE (Git) de upsert_manual_exchange_rate_with_audit
-- fuente: 20260827000006_exchange_rates_manual_hardening.sql stmt#7

CREATE OR REPLACE FUNCTION public.upsert_manual_exchange_rate_with_audit(
  p_actor_id uuid,
  p_currency text,
  p_rate numeric,
  p_rate_date date DEFAULT NULL,
  p_source text DEFAULT 'elToque',
  p_capture_method text DEFAULT 'real',
  p_source_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_today date := COALESCE(p_rate_date, CURRENT_DATE);
  v_old_rate numeric;
  v_old_rate_date date;
  v_row_id uuid;
  v_audit_id uuid;
BEGIN
  -- ── 1) Autorización contra la fuente de verdad (BD) ─────────────────────
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: actor nulo'
      USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_actor_role
    FROM public.profiles
   WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: % no es admin global',
      COALESCE(p_actor_id::text,'NULL')
      USING ERRCODE = '42501';
  END IF;

  -- ── 2) Snapshot bloqueado del valor inmediatamente anterior (H1) ────────
  SELECT er.rate, er.rate_date INTO v_old_rate, v_old_rate_date
    FROM public.exchange_rates er
   WHERE er.currency = p_currency
     AND er.source = p_source
     AND er.segment = '3'
   ORDER BY er.rate_date DESC, er.captured_at DESC
   LIMIT 1
   FOR UPDATE;

  -- ── 3) Mutación de la tasa (mismo conflict-key que la ruta histórica) ───
  INSERT INTO public.exchange_rates
    (rate_date, captured_at, currency, source, segment, rate, capture_method)
  VALUES (
    v_today, now(), p_currency, p_source, '3', p_rate,
    CASE WHEN p_capture_method IN ('real','estimated') THEN p_capture_method ELSE 'real' END
  )
  ON CONFLICT (rate_date, currency, source, segment)
  DO UPDATE SET rate = EXCLUDED.rate, captured_at = EXCLUDED.captured_at
  RETURNING id INTO v_row_id;

  -- ── 4) Pista de auditoría — MISMA TRANSACCIÓN (¿quién, qué, cuándo,
--        entidad, old/new?) ────────────────────────────────────────────────
  INSERT INTO public.exchange_rate_audit
    (actor_id, action, currency, old_rate, old_rate_date, new_rate, rate_date, source_ip)
  VALUES (
    p_actor_id, 'manual_upsert', p_currency,
    v_old_rate, v_old_rate_date, p_rate, v_today, p_source_ip
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'row_id', v_row_id,
    'audit_id', v_audit_id,
    'currency', p_currency,
    'old_rate', v_old_rate,
    'old_rate_date', v_old_rate_date,
    'new_rate', p_rate,
    'rate_date', v_today,
    'actor_role', v_actor_role
  );
END;
$function$
