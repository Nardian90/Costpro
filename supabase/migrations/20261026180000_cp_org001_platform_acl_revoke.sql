-- ═══════════════════════════════════════════════════════════════════════════
-- 20261026180000_cp_org001_platform_acl_revoke.sql
-- CP-ORG-001 ciclo 5 (incidente P0 admin@demo.com) — ACL de las funciones de
-- plataforma creadas por 20261026120000/20261026130000.
--
-- DEFECTO detectado por el SQL Security Gate EN VIVO (check
-- secdef_public_grant) tras la activación productiva del ciclo 4: dos
-- funciones SECURITY DEFINER quedaron con EXECUTE para PUBLIC/anon porque la
-- migración que las creó solo revocó para assign_user_organization:
--   · is_superadmin/0 — llamada por las policies stores_tenant_*
--     (RLS, bypass de SuperAdmin). Las policies evalúan con los privilegios
--     del usuario → authenticated DEBE conservar EXECUTE (misma doctrina que
--     is_admin: postgres + authenticated + service_role). anon jamás:
--     auth.uid() IS NULL → false; sin superficie útil y sin exposición.
--   · enforce_membership_tenant_consistency/0 — función DISPARADORA (trigger
--     de empresa única, §6 de 20261026120000): las funciones de trigger NO
--     pueden invocarse directamente (Postgres lo prohíbe), por lo que su
--     grant EXECUTE a PUBLIC/anon es inerte; se normaliza a la doctrina de
--     validate_active_store: postgres + service_role only.
--
-- Sin cambios de cuerpos, sin DDL, sin RLS. Solo ACL (estilo 20261026100000).
--
-- APLICACIÓN A PRODUCCIÓN: junto con el despliegue del PR #1484 y la migración
-- 20261026170000 (pasos de activación del expediente §17.6). Hasta entonces,
-- el check secdef_public_grant del gate mantiene el hallazgo `is_superadmin`
-- con el estado live de producción — documentado expresamente en el PR; el
-- hallazgo de funciones disparadoras desaparece por el fix de paridad del
-- propio check (scripts/ci-gate-sql-checks.js, Check 2 alineado con Check 1).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1) is_superadmin/0: helper de policies — authenticated + service_role, sin anon/PUBLIC
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;

-- 2) enforce_membership_tenant_consistency/0: función de trigger — service_role only
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_membership_tenant_consistency() TO service_role;

COMMIT;
