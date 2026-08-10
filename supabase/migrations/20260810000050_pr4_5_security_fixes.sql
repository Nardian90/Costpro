-- ============================================================================
-- PR-4.5 — Security fixes: RLS en backups + security_invoker en vistas
-- ============================================================================
-- 4 hallazgos CRITICAL del Supabase Security Advisor:
--   1. pr2_backup_receipts_20260810: RLS disabled
--   2. pr2_backup_receipt_items_20260810: RLS disabled
--   3. v_profiles_unified: SECURITY DEFINER view (elude RLS de profiles)
--   4. v_physical_count_summary: SECURITY DEFINER view (elude RLS de physical_counts)
--
-- Causa raíz:
--   1-2: Tablas de backup de PR-2 (commit 0447480a) creadas sin RLS.
--   3-4: Vistas creadas en migraciones v2.8/v2.9 sin security_invoker=true.
--        En Postgres 15+ (Supabase usa PG17), las vistas por defecto se
--        ejecutan como el owner (SECURITY DEFINER implícito), eludiendo el
--        RLS de las tablas subyacentes. Esto significa que cualquier
--        authenticated puede leer TODOS los perfiles y TODOS los physical
--        counts de TODAS las tiendas, sin importar las policies de RLS.
--
-- Fix:
--   1-2: Habilitar RLS + policy admin-only (solo lectura, solo admin).
--        Las tablas de backup son para recuperación manual, no para
--        consulta de negocio.
--   3-4: ALTER VIEW ... SET (security_invoker=true) para que la vista
--        se ejecute con los privilegios del caller, respetando el RLS
--        de las tablas subyacentes.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: pr2_backup_receipts_20260810 — habilitar RLS + policy admin-only
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pr2_backup_receipts_20260810 ENABLE ROW LEVEL SECURITY;

-- Policy: solo admin puede leer (SELECT). No INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS pr2_backup_receipts_admin_read ON public.pr2_backup_receipts_20260810;
CREATE POLICY pr2_backup_receipts_admin_read ON public.pr2_backup_receipts_20260810
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Sin policies de INSERT/UPDATE/DELETE = la tabla es read-only para authenticated.
-- Solo service_role (que bypassa RLS) puede modificarla.

COMMENT ON TABLE public.pr2_backup_receipts_20260810 IS
'PR-2 backup de receipts (29 filas, 2026-08-10). RLS habilitada: solo admin puede SELECT. Modificación solo via service_role. Preservar hasta política formal de retención.';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: pr2_backup_receipt_items_20260810 — habilitar RLS + policy admin-only
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pr2_backup_receipt_items_20260810 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr2_backup_receipt_items_admin_read ON public.pr2_backup_receipt_items_20260810;
CREATE POLICY pr2_backup_receipt_items_admin_read ON public.pr2_backup_receipt_items_20260810
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMENT ON TABLE public.pr2_backup_receipt_items_20260810 IS
'PR-2 backup de receipt_items (235 filas, 2026-08-10). RLS habilitada: solo admin puede SELECT. Modificación solo via service_role. Preservar hasta política formal de retención.';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 3: v_profiles_unified — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de profiles.
--        Cualquier authenticated podía leer TODOS los perfiles.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS de profiles.

ALTER VIEW public.v_profiles_unified SET (security_invoker = true);

COMMENT ON VIEW public.v_profiles_unified IS
'V2.8 + PR-4.5: Vista canónica de perfiles. role_enum siempre derivado de role_id via trigger.
PR-4.5: security_invoker=true añadido para respetar RLS de profiles (antes eludía RLS).';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 4: v_physical_count_summary — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de
--        physical_counts, physical_count_items, stores.
--        Cualquier authenticated podía leer TODOS los physical counts de TODAS las tiendas.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS de las tablas subyacentes.

ALTER VIEW public.v_physical_count_summary SET (security_invoker = true);

COMMENT ON VIEW public.v_physical_count_summary IS
'V2.9 H6 + PR-4.5: Vista resumen de physical counts para dashboard.
PR-4.5: security_invoker=true añadido para respetar RLS de physical_counts/stores/physical_count_items (antes eludía RLS).';
