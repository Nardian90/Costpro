-- ═════════════════════════════════════════════════════════════════════════════
-- CP-FIN-T12-PRIVILEGE-HARDENING-001 (2026-11-16)
-- PRIVILEGIO MÍNIMO EXECUTE sobre public.fin_entry_reversal_residual(uuid)
-- ═════════════════════════════════════════════════════════════════════════════
-- HALLAZGO (diagnóstico read-only de producción, expediente
-- docs/audits/fin-t12-privilege-hardening-001/):
--   La migración T12 (20261115100000, aplicada a producción — libro id 61)
--   concedió EXECUTE a `authenticated` sobre el helper
--   fin_entry_reversal_residual (línea 177 del archivo T12). El helper es
--   SECURITY DEFINER (owner postgres) de SOLO lectura sobre fin_entries /
--   fin_movements (tablas con RLS FORCED) y NO tiene verificación de
--   identidad ni de tienda: un usuario `authenticated` podía invocarlo
--   directamente vía PostgREST RPC (POST /rest/v1/rpc/fin_entry_reversal_residual)
--   con CUALQUIER uuid y obtener la desviación agregada entre un asiento y
--   sus reversiones de ARBITRARIA tienda — elusión de RLS y fuga de
--   agregados financieros entre tenants.
--
-- SEMÁNTICA POSTGRESQL (por qué el REVOKE no rompe los llamadores internos):
--   El privilegio EXECUTE se comprueba en CADA llamada contra el ROL EFECTIVO
--   del momento. Dentro de una función SECURITY DEFINER el rol efectivo pasa
--   a ser el PROPIETARIO (postgres) durante su ejecución; las llamadas
--   anidadas al helper (desde fin_post_document_annulment y desde el trigger
--   fin_t12_block_receipt_annulment — ambos SECURITY DEFINER owner postgres)
--   se comprueban contra postgres, NUNCA contra el rol invocante. Por tanto
--   revocar EXECUTE a `authenticated` solo elimina la invocación DIRECTA
--   (PostgREST) y no afecta a ningún cauce interno autorizado.
--
-- DECISIÓN DE PRIVILEGIO MÍNIMO (justificación de cada GRANT/REVOKE):
--   REVOKE EXECUTE de `authenticated` → sin llamador legítimo directo: el
--     frontend/RPC no usa el helper (verificado por búsqueda en el repo);
--     el residual se calcula dentro del motor/trigger T12.
--   REVOKE de PUBLIC y anon (re-afirmación idempotente; T12 ya lo hacía) →
--     defensa en profundidad: el default de ACL de función es EXECUTE a
--     PUBLIC; se explicita para que ninguna redefinición futura lo restaure.
--   GRANT EXECUTE a `service_role` (se conserva; explícito) → los procesos
--     server-side del backend conservan capacidad de diagnóstico/operación.
--   Owner (postgres) → privilegio implícito de propietario, no revocable ni
--     revocado; es el rol bajo el que corren los llamadores internos.
--   NO se modifica ninguna otra función financiera (alcance mínimo).
--
-- CONDICIONES:
--   · Migración nueva e inmutable — NO edita T12 (20261115100000) ni ninguna
--     migración ya aplicada (regla del mandato).
--   · Idempotente: REVOKE/GRANT/COMMENT son idempotentes por construcción.
--   · Precondiciones y postcondiciones fail-closed (el DO aborta si el estado
--     ACL final no es el esperado).
--   · No toca datos financieros, movimientos históricos ni resultados
--     contables: solo ACL + comment del catálogo.
--   · El registro en production_migration_ledger lo realiza el runbook de
--     despliegue autorizado (scripts/m056-fin-t12-privilege-deploy.mjs) en el
--     momento de la aplicación, como el resto de migraciones del repo.
-- ═════════════════════════════════════════════════════════════════════════════

DO $priv$
DECLARE
  v_fn       regprocedure := to_regprocedure('public.fin_entry_reversal_residual(uuid)');
  v_motor    regprocedure := to_regprocedure('public.fin_post_document_annulment(text,uuid)');
  v_trigger  regprocedure := to_regprocedure('public.fin_t12_block_receipt_annulment()');
  v_owner    text;
BEGIN
  -- ── PRECONDICIONES ────────────────────────────────────────────────────────
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'PRIV-HARDENING-PRECOND: public.fin_entry_reversal_residual(uuid) no existe — la migración T12 (20261115100000) debe aplicarse ANTES que esta (orden canónico del replay)';
  END IF;
  IF v_motor IS NULL OR v_trigger IS NULL THEN
    RAISE EXCEPTION 'PRIV-HARDENING-PRECOND: llamadores internos T12 ausentes (fin_post_document_annulment=%, fin_t12_block_receipt_annulment=%) — estado T12 incompleto',
      v_motor IS NOT NULL, v_trigger IS NOT NULL;
  END IF;
  SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid = v_fn;
  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'PRIV-HARDENING-PRECOND: el helper no es propiedad de postgres (owner=%) — revisar antes de endurecer ACL', v_owner;
  END IF;

  -- ── RESTRICCIÓN (idempotente) ─────────────────────────────────────────────
  REVOKE ALL ON FUNCTION public.fin_entry_reversal_residual(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.fin_entry_reversal_residual(uuid) TO service_role;

  -- ── POSTCONDICIONES (fail-closed) ─────────────────────────────────────────
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIV-HARDENING-POSTCOND: authenticated conserva EXECUTE sobre el helper';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIV-HARDENING-POSTCOND: anon conserva EXECUTE sobre el helper';
  END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIV-HARDENING-POSTCOND: PUBLIC conserva EXECUTE sobre el helper';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIV-HARDENING-POSTCOND: service_role perdió EXECUTE (capacidad server-side rota)';
  END IF;
  IF NOT has_function_privilege(v_owner, v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIV-HARDENING-POSTCOND: el owner (%) perdió EXECUTE (los llamadores internos SECURITY DEFINER lo necesitarían)', v_owner;
  END IF;

  RAISE NOTICE 'PRIV-HARDENING OK: fin_entry_reversal_residual(uuid) → EXECUTE solo service_role + owner; authenticated/anon/PUBLIC revocados';
END
$priv$;

-- ── Documentación del catálogo (idempotente) ────────────────────────────────
COMMENT ON FUNCTION public.fin_entry_reversal_residual(uuid) IS
  'CP-FIN-FINAL-CLOSE-005 (T12): desviación (CUP) entre un asiento y sus reversiones enlazadas por reversal_of. 0 = cobertura total; >0.01 = reversión parcial/exceso con residual pendiente. ACL endurecida por CP-FIN-T12-PRIVILEGE-HARDENING-001 (20261116120000): EXECUTE solo service_role + owner; authenticated/anon/PUBLIC revocados — los llamadores internos (fin_post_document_annulment, trigger fin_t12_block_receipt_annulment) son SECURITY DEFINER owner postgres y no dependen de grants externos (la comprobación EXECUTE de las llamadas anidadas se hace contra el rol efectivo del definer).';

-- ═════════════════════════════════════════════════════════════════════════════
-- FIN — CP-FIN-T12-PRIVILEGE-HARDENING-001
-- Aplicación a producción: SOLO con autorización de despliegue del
-- propietario, por el runbook scripts/m056-fin-t12-privilege-deploy.mjs
-- (pre-chequeo de permisos vigentes → aplicación → registro en
-- production_migration_ledger → verificación post — §5 del mandato).
-- ═════════════════════════════════════════════════════════════════════════════
