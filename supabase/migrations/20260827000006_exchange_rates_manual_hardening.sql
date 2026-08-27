-- ============================================================================
-- 20260827000006_exchange_rates_manual_hardening.sql
-- FIX · F3-P1-01 — Pista de auditoría persistente para tasas manuales
-- ENMIENDA v2 (GATE-REVIEW-619ccb64 · H1 + E3, ratificada por el dueño)
-- ============================================================================
-- La ruta /api/exchange-rates/manual permite modificar la tasa global que
-- alimenta la conversión contable. A partir del FIX, la escritura queda
-- restringida a rol admin (DECISION-FX-01 en el código) y cada cambio queda
-- registrado A TOMICAMENTE en esta tabla mediante la RPC
-- upsert_manual_exchange_rate_with_audit() definida al final del archivo.
--
-- ENMIENDA H1 (valor anterior y nuevo):
--   * old_rate      numeric NULL  — valor vigente ANTES del cambio.
--   * old_rate_date date     NULL — fecha de esa fila anterior (puede diferir
--     de rate_date cuando el primer registro del día crea fila nueva).
--   * NULL = primera creación para esa moneda/fuente/segmento (sin valor previo).
--
-- ENMIENDA E3 (atomicidad — DECISION-AUD-02):
--   El dueño rechazó el diseño best-effort ("si la auditoría falla, la mutación
--   ya aplicada queda sin rastro"). El único camino de escritura en producción
--   es ahora la RPC SECURITY DEFINER que ejecuta dentro de UNA transacción:
--       validar actor (profiles.role='admin' contra BD, no confiar en JWT)
--       → FOR UPDATE fila anterior
--       → UPSERT nueva tasa
--       → INSERT audit(old_rate,new_rate,...)
--   Cualquier fallo ⇒ ROLLBACK conjunto: NUNCA tasa cambiada sin auditoría,
--   ni auditoría sin cambio real. La ruta ya no hace upsert directo ni insert
--   best-effort; SOLO invoca la RPC vía service-role.
--
-- Cadena de autorización (defensa en profundidad):
--   JWT válido → identidad server-side → rol admin en ruta (rápido) →
--   RPC revalida actor_id contra profiles.role='admin' (fuente de verdad BD).
--
-- Diseño RLS deliberado (anti-regresión F3-P0-01):
--   * RLS ENABLED + FORCE y CERO políticas TO authenticated ⇒ DENY total para
--     clientes autenticados/anon vía API REST (fail-closed; pista NO falsificable).
--   * Escritura solo por service-role a través de la RPC; lectura back-office
--     interna igualmente service-role. EXECUTE de la RPC concedido EXCLUSIVAMENTE
--     a service_role.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.exchange_rate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'manual_upsert',
  currency text NOT NULL,
  -- ── ENMIENDA H1 · valores ANTERIORES ────────────────────────────────────
  old_rate numeric,            -- NULL = primera creación de la moneda
  old_rate_date date,          -- fecha de la fila previa (puede ser otro día)
  new_rate numeric NOT NULL,
  rate_date date NOT NULL,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de consulta típica: historia por moneda y fecha
CREATE INDEX IF NOT EXISTS idx_exchange_rate_audit_currency_date
  ON public.exchange_rate_audit (currency, rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_audit_actor
  ON public.exchange_rate_audit (actor_id, created_at DESC);

-- Fail-closed: RLS on + cero políticas para authenticated/anon
ALTER TABLE public.exchange_rate_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_audit FORCE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- RPC ATÓMICA (E3 / DECISION-AUD-02)
-- Upsert de tasa manual + pista de auditoría(old,new) en UNA transacción.
--
-- Contrato:
--   p_actor_id        identidad REAL del operador (session.user.id). La RPC la
--                     revalida contra profiles.role='admin'. No es confiable un
--                     rol afirmado por cliente/JWT — se verifica en BD.
--   p_currency        'USD'|'EUR'|'MLC' (CHECK lo respalda).
--   p_rate            nuevo valor (CHECK rate>0).
--   p_rate_date       NULL ⇒ hoy. Conflict key: (rate_date,currency,source,segment).
--   p_source          default 'elToque'.
--   p_capture_method  default 'real'.
--   p_source_ip       hop IP para la pista.
--
-- Semántica de old_rate (H1):
--   Se lee SIEMPRE la fila MÁS RECIENTE existente de la misma moneda/source/
--   segment (ORDER BY rate_date DESC, captured_at DESC), con FOR UPDATE para
--   cerrar carreras entre admins concurrentes:
--     * primera creación              ⇒ old_rate=NULL, old_rate_date=NULL
--     * cambio mismo día              ⇒ old=tasa vigente de ese día
--     * alta en día distinto          ⇒ old=último valor inmediatamente anterior
--                                        (aunque sea de otra fecha)
-- ============================================================================
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
$function$;

REVOKE ALL ON FUNCTION public.upsert_manual_exchange_rate_with_audit(uuid,text,numeric,date,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_manual_exchange_rate_with_audit(uuid,text,numeric,date,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_manual_exchange_rate_with_audit(uuid,text,numeric,date,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_manual_exchange_rate_with_audit(uuid,text,numeric,date,text,text,text) TO service_role;

COMMENT ON FUNCTION public.upsert_manual_exchange_rate_with_audit IS
  'F3-P1-01/H1/E3 (DECISION-AUD-02): upsert atómico tasa+auditoría(old/new); revalida admin contra profiles; ROLLBACK conjunto ante cualquier fallo.';

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN (operador):
--   1) SELECT count(*) FROM pg_policies WHERE tablename='exchange_rate_audit';
--      Esperado: 0 políticas (acceso solo vía service-role).
--   2) SELECT count(*) FROM information_schema.columns
--       WHERE table_name='exchange_rate_audit' AND column_name IN ('old_rate','old_rate_date');
--      Esperado: 2.
--   3) SELECT count(*) FROM pg_proc p WHERE p.proname='upsert_manual_exchange_rate_with_audit';
--      Esperado: 1.
--   4) has_function_privilege('service_role','…with_audit(uuid,text,numeric,date,text,text,text)','EXECUTE')
--      Esperado: true — y false para authenticated/anon.
-- ============================================================================
