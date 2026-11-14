-- ═══════════════════════════════════════════════════════════════════════════
-- CP-SEC-RATELIMIT — ALMACÉN DISTRIBUIDO DE CONTADORES DE RATE LIMIT
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (misión §6): el rate limit de la app (src/lib/rate-limit.ts) usa
-- Upstash Redis SOLO si está configurado (UPSTASH_*); en su ausencia cae a
-- un Map EN MEMORIA por proceso/instancia: en Vercel cada instancia serverless
-- tiene su propio contador y N instancias permiten N×el límite. La protección
-- de fuerza bruta (src/lib/auth-rate-limit.ts) es además solo-memoria y no
-- se usa en ninguna ruta.
--
-- SOLUCIÓN (sin servicios externos nuevos): contadores en PostgreSQL
-- (Supabase, infraestructura EXISTENTE del proyecto) con incremento ATÓMICO
-- por UPSERT — ventana fija por (clave, ventana). Un único almacén compartido
-- por todos los procesos/instancias. Política de fallo explícita en la capa
-- de aplicación (fail-open para disponibilidad general, fail-closed para
-- operaciones de autenticación/seguridad).
--
-- DISEÑO:
--   · rate_limit_buckets(bucket_key, window_start) PK compuesta: la pareja
--     identifica UNA ventana fija de UNA clave. El incremento es un único
--     INSERT ... ON CONFLICT DO UPDATE (atómico en PostgreSQL; sin READ-
--     MODIFY-WRITE de la aplicación, sin carreras entre procesos).
--   · RLS FORCED sin políticas: anon/authenticated no pueden leer ni
--     escribir contadores; el acceso es SOLO por el RPC SECURITY DEFINER
--     (ejecutable únicamente por service_role — el servidor Next.js).
--   · Limpieza: borrado oportunista (1% de las llamadas) de ventanas con
--     más de 24 h; índice en window_start para que el DELETE sea barato.
--   · Ventana fija calculada SIEMPRE en el servidor de BD (now()): no
--     depende del reloj de cada instancia.
--
-- PARÁMETROS VALIDADOS: limit 1..100000, ventana 1..86400 s, clave 1..300.
--
-- Idempotente: IF NOT EXISTS / OR REPLACE / guards.
-- Reversibilidad: DROP TABLE public.rate_limit_buckets; DROP FUNCTION
--   public.rate_limit_take(text, int, int);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (bucket_key, window_start),
  CONSTRAINT rate_limit_buckets_key_len CHECK (length(bucket_key) BETWEEN 1 AND 300)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window
  ON public.rate_limit_buckets (window_start);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets FORCE ROW LEVEL SECURITY;

-- Sin políticas para anon/authenticated: denegación total por RLS.
-- service_role (bypassrls) y postgres conservan acceso.

-- RPC atómico de toma de un golpe de rate limit (ventana fija)
CREATE OR REPLACE FUNCTION public.rate_limit_take(
  p_bucket_key text,
  p_limit int,
  p_window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_window_start timestamptz;
  v_hits bigint;
  v_allowed boolean;
  v_reset_at timestamptz;
BEGIN
  -- Validación de parámetros (fail-closed ante valores absurdos)
  IF p_bucket_key IS NULL OR btrim(p_bucket_key) = '' OR length(p_bucket_key) > 300 THEN
    RAISE EXCEPTION 'ERR_RATE_LIMIT_KEY_INVALID';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'ERR_RATE_LIMIT_LIMIT_INVALID: %', p_limit;
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'ERR_RATE_LIMIT_WINDOW_INVALID: %', p_window_seconds;
  END IF;

  -- Ventana fija alineada al epoch (fuente de tiempo: el servidor de BD)
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  -- Incremento ATÓMICO (UPSERT): sin carreras aunque varios procesos
  -- simultáneos (o instancias serverless distintas) golpeen la misma clave.
  INSERT INTO public.rate_limit_buckets (bucket_key, window_start, hits)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET hits = public.rate_limit_buckets.hits + 1,
                updated_at = now()
  RETURNING hits INTO v_hits;

  v_allowed := v_hits <= p_limit;

  -- Limpieza oportunista (≈1% de las llamadas): ventanas de hace >24 h
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets
     WHERE window_start < now() - INTERVAL '24 hours';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_hits,
    'limit', p_limit,
    'reset_at', v_reset_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_take(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_take(text, int, int) TO service_role;

COMMENT ON TABLE public.rate_limit_buckets IS
  'CP-SEC-RATELIMIT: contadores de rate limit distribuidos (ventana fija por clave+ventana). Acceso solo vía RPC rate_limit_take (service_role). Sin políticas RLS para anon/authenticated.';
COMMENT ON FUNCTION public.rate_limit_take(text, int, int) IS
  'CP-SEC-RATELIMIT: incrementa atómicamente el contador de la clave en la ventana actual y devuelve {allowed, count, limit, reset_at}. Solo service_role.';

-- Verificación fail-closed
DO $verify$
DECLARE
  v_rls boolean;
  v_policies int;
  v_grants_anon int;
BEGIN
  SELECT c.relrowsecurity AND c.relforcerowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'rate_limit_buckets';
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'rate_limit_buckets';
  SELECT count(*) INTO v_grants_anon
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'
     AND grantee IN ('anon', 'authenticated');

  IF NOT v_rls THEN RAISE EXCEPTION 'CP-SEC-RATELIMIT: RLS no forzada en rate_limit_buckets'; END IF;
  IF v_policies <> 0 THEN RAISE EXCEPTION 'CP-SEC-RATELIMIT: % políticas inesperadas en rate_limit_buckets', v_policies; END IF;
  IF v_grants_anon <> 0 THEN RAISE EXCEPTION 'CP-SEC-RATELIMIT: anon/authenticated conservan % privilegios', v_grants_anon; END IF;
  RAISE NOTICE 'CP-SEC-RATELIMIT OK: tabla RLS FORCED sin políticas, RPC solo service_role';
END
$verify$;
