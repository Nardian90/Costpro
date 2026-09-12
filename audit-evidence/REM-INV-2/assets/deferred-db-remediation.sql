-- ==============================================================================
-- REM-INV-2 — DEFERRED DB REMEDIATION (NOT EXECUTED by this gate)
-- Estado: DEFERRED — requiere canal DDL autorizado (producción es READ ONLY
--         para este gate; zero-touch §REGLAS INVIOLABLES).
-- Precedente: REM-V2-3 (commit 90dce25f) difirió DROP de reverse_receipt /
--         reverse_adjustment por la misma limitación externa.
-- Ejecutar SOLO tras: (1) re-ejecutar los checks de dependencia incluidos,
-- (2) autorización DDL explícita del operador, (3) ventana de mantenimiento.
-- ==============================================================================

-- STEP 0 — GUARDS: deben devolver 0 filas antes de continuar. Si devuelven
-- algo, STOP (apareció un caller interno/dependencia nuevo desde REM-INV-2).
SELECT p.proname AS internal_caller  -- expect: 0 rows
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname <> 'receive_purchase'
  AND pg_get_functiondef(p.oid) ~ '(^|[^a-zA-Z0-9_])receive_purchase([^a-zA-Z0-9_]|$)';

SELECT tgname AS trigger_caller      -- expect: 0 rows
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname = 'receive_purchase' AND NOT t.tgisinternal;

SELECT relname AS dependent_view     -- expect: 0 rows
FROM pg_depend d JOIN pg_class c ON c.oid = d.objid
WHERE d.refobjid = 'public.receive_purchase(uuid)'::regprocedure;

-- STEP 1 — Retirar superficie de EXECUTE directo (vector S17 de 04-static-reachability.md).
-- Esto cierra el riesgo residual: PO status-flip directo por authenticated.
REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid) FROM anon;  -- idempotente si no existe grant

-- STEP 2 — Verificación de cierre (debe fallar con permission denied para authenticated):
--   SET ROLE authenticated; SELECT public.receive_purchase('00000000-0000-0000-0000-000000000000'); RESET ROLE;
-- (el error 42501 EXPECTED confirma el cierre)

-- STEP 3 — DROP físico de la función huérfana (opcional, tras STEP 1 estabilizado).
-- NOTA: consume la tabla legacy purchase_items (0 filas; única referenciadora).
-- La retirada de la TABLA purchase_items debe evaluarse en un gate DDL propio
-- (afecta esquema histórico; no es alcance de REM-INV-2).
DROP FUNCTION IF EXISTS public.receive_purchase(uuid);
