-- ==============================================================================
-- REM-INV-3R-B — 10-ddl-proposal.sql
-- SEC-F02-1: cierre de superficie de escritura directa sobre devolutions /
-- devolution_items para roles de extremo (anon, authenticated).
--
-- Justificación (REM-INV-3R-B staging, comportamiento demostrado):
--   PRE: 10 vías de abuso SUCCEEDED (INSERT NC fabricada, réplica NC-000008,
--        UPDATE total_amount/original_transaction_id/processed_by/status,
--        INSERT items 999u, documento huérfano sin efectos laterales, TRUNCATE).
--   POST (mismo REVOKE en staging espejo): 14/14 DENIED.
--   V2 (create_devolution_v2 / reverse_devolution): 12/12 PASS en staging con
--        este REVOKE aplicado — SECURITY DEFINER owner postgres, EXECUTE
--        restrictivo (postgres+service_role), no depende de grants de tabla.
-- Callers legítimos: 0 (censo estático completo). SELECT se CONSERVA (hook de
-- duplicado lee devolutions/devolution_items como authenticated vía RLS).
--
-- Superficie exacta: 2 tablas × 2 roles × 4 privilegios. Sin CASCADE, sin
-- políticas, sin datos, sin funciones, sin otras tablas.
-- ==============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.devolutions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.devolution_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.devolutions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.devolution_items FROM anon;

-- Se CONSERVAN explícitamente (sin cambio):
--   SELECT                    → anon, authenticated (lectura controlada por RLS own-store)
--   REFERENCES, TRIGGER, MAINTAIN → inertes vía PostgREST (sin ruta HTTP), fuera
--     de la superficie de escritura DML objeto de SEC-F02-1
--   Todos los privilegios     → postgres (owner), service_role (BYPASSRLS)
--   Políticas RLS             → SIN CAMBIO (se conservan como segunda barrera;
--     defesa en profundidad si un grant futuro re-expone escritura)
