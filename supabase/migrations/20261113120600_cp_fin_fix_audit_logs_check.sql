-- ══════════════════════════════════════════════════════════════════════════
-- CP-FIN · FIX AUDIT_LOGS: reglas GLOBALES y el check audit_logs_store_id_check
-- (2026-11-13, auditoría final)
-- ══════════════════════════════════════════════════════════════════════════
-- DEFECTO ALTO detectado por la auditoría integral (Caso I):
--
--   fin_activate_rule_version y fin_deactivate_rule_version registran su
--   acción en audit_logs con store_id = v_rule.store_id, que es NULL para
--   reglas GLOBALES (store_id IS NULL = configuración a nivel organización).
--   El check audit_logs_store_id_check solo tolera store_id NULL para una
--   whitelist de tablas (profiles, stores, system, master_products,
--   master_parties) → 23514 → NO se puede activar ni desactivar NINGUNA
--   regla global (las 10 semilla son globales).
--
-- CORRECCIÓN (mismo patrón que master_products 20261030143000 y
--   master_parties 20261105130000): ampliar la whitelist con
--   'fin_rule_versions'. La ampliación es DINÁMICA: se lee la lista vigente
--   del constraint y se le añade la entrada — así no se regrede ninguna
--   futura ampliación out-of-band y la migración es re-ejecutable sin daño.
--
-- Semántica: una regla contable global pertenece a la organización, no a una
--   tienda; su auditoría de activación/desactivación es de nivel organización.
--
-- Idempotente: si 'fin_rule_versions' ya está en la whitelist, no hace nada.
-- ══════════════════════════════════════════════════════════════════════════

DO $fix$
DECLARE
  v_def text;
  v_arr text;
  v_new text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'audit_logs_store_id_check'
     AND conrelid = 'public.audit_logs'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CP-FIN audit_logs: check audit_logs_store_id_check ausente (esquema inesperado)';
  END IF;

  IF position('fin_rule_versions' in v_def) = 0 THEN
    -- extraer el literal ARRAY[...] vigente y añadir la nueva entrada
    v_arr := substring(v_def from 'ARRAY\[(.*?)\]\)');
    IF v_arr IS NULL OR v_arr = '' THEN
      RAISE EXCEPTION 'CP-FIN audit_logs: whitelist no reconocida en: %', v_def;
    END IF;
    v_new := 'CHECK (store_id IS NOT NULL OR table_name = ANY (ARRAY['
             || v_arr || ', ' || quote_literal('fin_rule_versions') || '::text]))';
    EXECUTE 'ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_store_id_check';
    EXECUTE 'ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_store_id_check ' || v_new;
    RAISE NOTICE 'CP-FIN audit_logs: whitelist ampliada con fin_rule_versions';
  ELSE
    RAISE NOTICE 'CP-FIN audit_logs: fin_rule_versions ya presente en la whitelist (sin cambios)';
  END IF;
END
$fix$;

-- Guard fail-closed: el constraint debe tolerar fin_rule_versions SIN perder
-- las entradas preexistentes, y los dos RPCs deben seguir presentes.
DO $guard$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'audit_logs_store_id_check'
     AND conrelid = 'public.audit_logs'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CP-FIN audit_logs GUARD: constraint ausente tras la migración';
  END IF;
  IF position('fin_rule_versions' in v_def) = 0 THEN
    RAISE EXCEPTION 'CP-FIN audit_logs GUARD: el CHECK no tolera table_name=fin_rule_versions';
  END IF;
  IF position('master_products' in v_def) = 0 OR position('master_parties' in v_def) = 0 THEN
    RAISE EXCEPTION 'CP-FIN audit_logs GUARD: se perdió una entrada preexistente de la whitelist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fin_activate_rule_version')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fin_deactivate_rule_version') THEN
    RAISE EXCEPTION 'CP-FIN audit_logs GUARD: RPCs de activación/desactivación ausentes';
  END IF;
  RAISE NOTICE 'CP-FIN audit_logs GUARD: OK (whitelist íntegra + RPCs presentes)';
END
$guard$;
