-- =====================================================================
-- regularize_sale_payment — cierre ACL (REM-INV-6: alineación LIVE ↔ stream)
-- =====================================================================
-- Contexto: la función fue desplegada en LIVE (out-of-band, 2026-10-14) y los
-- privilegios por defecto de Supabase materializaron EXECUTE para anon y
-- authenticated, además del EXECUTE público heredado. El GRANT a service_role
-- de la migración 20261014080000 sí quedó aplicado.
--
-- El contrato de seguridad de CI (scripts/security-contract-test-static.cjs,
-- Capa C REM-INV-6) exige que la superficie LIVE sea reproducible por el
-- stream de migraciones: snapshot certificado [PUBLIC, anon, authenticated,
-- service_role] ≠ replay [PUBLIC, service_role] → UNEXPECTED_ACL_DRIFT.
--
-- Intención documentada de 20261014080000 («Canal de llamada»): SOLO
-- service_role. La propia función fail-cierra cualquier otro rol
-- (v_jwt_role IS DISTINCT FROM 'service_role' → excepción) y no existe ningún
-- llamador cliente (0 referencias en src/). Revocar es defense-in-depth.
--
-- Efecto: REVOKE EXECUTE a PUBLIC/anon/authenticated. DCL puro — reversible
-- con el GRANT inverso, sin cambio de esquema, sin datos, sin impacto en la
-- conciliación de inventario. Tras aplicarlo se re-certifica el surface
-- (scripts/export-contract-surface.cjs).
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.regularize_sale_payment(uuid, text, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.regularize_sale_payment(uuid, text, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.regularize_sale_payment(uuid, text, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric) FROM authenticated;
