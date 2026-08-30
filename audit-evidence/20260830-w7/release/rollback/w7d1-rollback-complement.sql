-- ============================================================================
-- w7d1-rollback-complement.sql — COMPLEMENTO de rollback (hallazgo W7-D1 re-gate)
-- w7-rollback.sql (generado desde snapshot v6) dropea el trigger trg_guard_wac_writer
-- y fn_recalc_wac, pero NO la función de trigger w62_guard_wac_writer() creada por
-- pkg 01 → queda huérfana e inerte (su trigger ya no existe; invocación directa
-- imposible: «trigger functions can only be called as triggers»; con EXECUTE a
-- PUBLIC pero sin efecto sobre datos). El complemento la elimina para dejar el
-- esquema byte-idéntico a la baseline, sin huérfanos.
-- ============================================================================
DROP FUNCTION IF EXISTS public.w62_guard_wac_writer();
