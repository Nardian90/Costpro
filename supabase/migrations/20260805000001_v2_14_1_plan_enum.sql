-- ============================================================================
-- Migration: 20260805000001_v2_14_1_plan_enum.sql
-- Iteración 12 — Fix Q5 (plan enum)
-- ============================================================================
-- PROBLEMA: profiles.plan es TEXT sin constraint, con valores inconsistentes
-- ('basico', 'profesional', 'enterprise', 'free', 'pro', NULL).
-- tenant-limiter.ts espera 'free'/'pro'/'enterprise' pero no se valida.
--
-- SOLUCIÓN: Migrar a enum plan_t con backfill documentado y reversible.
--
-- ESTRATEGIA:
--   1. CREATE TYPE plan_t AS ENUM ('free', 'pro', 'enterprise')
--   2. ADD COLUMN plan_new plan_t (NULL temporalmente)
--   3. Backfill con CASE: basico→free, profesional→pro, enterprise→enterprise,
--      free→free, NULL/otros→free
--   4. Verificar que no queden NULLs (validación previa)
--   5. DROP COLUMN plan (TEXT)
--   6. RENAME COLUMN plan_new TO plan
--   7. ALTER COLUMN plan SET NOT NULL, DEFAULT 'free'::plan_t
--
-- UP: pasos 1-7
-- DOWN: reverso (con pérdida de 'pro' values que no tenían equivalente TEXT)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Crear enum plan_t
DO $$ BEGIN
  CREATE TYPE plan_t AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Añadir columna plan_new (NULL temporalmente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_new plan_t;

-- 3. Backfill con CASE explícito
--    Valores conocidos en producción: 'free' (15), 'enterprise' (3)
--    Valores legacy en código: 'basico', 'profesional', 'enterprise'
UPDATE public.profiles SET plan_new = CASE
  WHEN plan = 'free' THEN 'free'::plan_t
  WHEN plan = 'basico' THEN 'free'::plan_t
  WHEN plan = 'pro' THEN 'pro'::plan_t
  WHEN plan = 'profesional' THEN 'pro'::plan_t
  WHEN plan = 'enterprise' THEN 'enterprise'::plan_t
  WHEN plan IS NULL OR plan NOT IN ('free', 'basico', 'pro', 'profesional', 'enterprise') THEN 'free'::plan_t
  ELSE NULL
END
WHERE plan_new IS NULL;

-- 4. Validación: si quedan NULLs, fallar (no debería pasar tras el CASE ELSE)
DO $$
DECLARE v_null_count integer;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM public.profiles WHERE plan_new IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % profiles con plan_new NULL', v_null_count;
  END IF;
END $$;

-- 5. DROP COLUMN plan (TEXT)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan;

-- 6. RENAME plan_new → plan
ALTER TABLE public.profiles RENAME COLUMN plan_new TO plan;

-- 7. SET NOT NULL + DEFAULT
ALTER TABLE public.profiles
  ALTER COLUMN plan SET NOT NULL,
  ALTER COLUMN plan SET DEFAULT 'free'::plan_t;

COMMENT ON COLUMN public.profiles.plan IS
  'Iteración 12 (Q5): plan_t enum. Backfilled from TEXT. Values: free, pro, enterprise.';

COMMENT ON TYPE public.plan_t IS
  'Iteración 12 (Q5): Subscription plan enum. free=trial, pro=paid, enterprise=large.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Para revertir:
--   ALTER TABLE public.profiles
--     ADD COLUMN plan_text TEXT,
--     ALTER COLUMN plan_text SET DEFAULT 'free';
--   UPDATE public.profiles SET plan_text = CASE
--     WHEN plan = 'free'::plan_t THEN 'free'
--     WHEN plan = 'pro'::plan_t THEN 'pro'
--     WHEN plan = 'enterprise'::plan_t THEN 'enterprise'
--   END;
--   ALTER TABLE public.profiles DROP COLUMN plan;
--   ALTER TABLE public.profiles RENAME COLUMN plan_text TO plan;
--   DROP TYPE public.plan_t;
--
-- NOTA: 'pro' values se preservan como 'pro' TEXT (compatible con tenant-limiter).
--        No hay pérdida de datos.
-- ============================================================================
