-- ═══════════════════════════════════════════════════════════════════════════
-- 20261026100000_caja_acl_anon_revoke.sql
-- MISIÓN AUTÓNOMA INTEGRAL — Fase E (ACL efectivos post-aplicación de la cadena)
--
-- DEFECTO detectado por el contrato de seguridad EN VIVO tras aplicar la cadena
-- (security-contract-test.cjs): 3 funciones SECURITY DEFINER de negocio quedaron
-- con EXECUTE para anon:
--   · reverse_devolution/4 — heredó los default privileges de Supabase al
--     crearse en 20261024400000 (el overload /3 retirado tenía ACL
--     service_role-only; el /4 se creó con los grants por defecto del
--     plataforma: anon+authenticated+service_role).
--   · register_cash_adjustment/7 y pay_commission/7 (20261026000000) — el
--     REVOKE FROM PUBLIC de esa migración NO alcanza los default privileges
--     (Supabase otorga EXECUTE explícito a anon/authenticated/service_role a
--     toda función nueva de public — no vía PUBLIC).
--
-- CORRECTIVA: REVOKE explícito por rol, alineado con la doctrina del módulo:
--   · reverse_devolution/4: service_role-only (la app la invoca con el cliente
--     admin — /api/reverse; igual que create_devolution_v2 y el resto de la
--     caja transaccional).
--   · register_cash_adjustment/7 y pay_commission/7: authenticated +
--     service_role (la app las invoca con el cliente de sesión; autorización
--     REAL verificada dentro por has_store_role_as — fail-closed).
--
-- Sin cambios de cuerpos, sin DDL, sin RLS. Solo ACL.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1) reverse_devolution/4: doctrina caja transaccional — service_role-only
REVOKE ALL ON FUNCTION public.reverse_devolution(uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_devolution(uuid, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_devolution(uuid, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_devolution(uuid, text, uuid, jsonb) TO service_role;

-- 2) register_cash_adjustment/7: app vía cliente de sesión — sin anon
REVOKE ALL ON FUNCTION public.register_cash_adjustment(uuid, text, numeric, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_cash_adjustment(uuid, text, numeric, text, timestamptz, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_cash_adjustment(uuid, text, numeric, text, timestamptz, text, uuid) TO authenticated, service_role;

-- 3) pay_commission/7: app vía cliente de sesión — sin anon
REVOKE ALL ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamptz, uuid) TO authenticated, service_role;

COMMIT;
