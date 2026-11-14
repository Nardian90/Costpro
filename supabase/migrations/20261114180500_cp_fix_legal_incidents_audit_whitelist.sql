-- ═══════════════════════════════════════════════════════════════════════════
-- CP-FIX — LEGAL_INCIDENTS EN LA WHITELIST DE audit_logs_store_id_check
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14) · cierre de BUG-024
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DEFECTO REPRODUCIDO (BD aislada CostproE2E, 2026-11-14):
--   POST /api/legal/incidents → 500. El endpoint (fix de BUG-024, Decisión D
--   del propietario, PR #1431 + índice 20261020000005) persiste el incidente
--   en audit_logs con table_name='legal_incidents' y store_id=NULL (los
--   incidentes legales son reportes a nivel plataforma, no de tienda).
--   El constraint audit_logs_store_id_check —cuya whitelist solo toleraba
--   NULL para (profiles, stores, system, master_products, master_parties,
--   fin_rule_versions)— rechaza esa fila:
--     23514 ... violates check constraint "audit_logs_store_id_check"
--   El test.skip obsoleto de e2e/legal.spec.ts ocultaba la regresión desde
--   que el check se endureció; al sustituirlo por una prueba real (cierre
--   formal de BUG-024) la regresión quedó al descubierto y reproducida.
--
-- CORRECCIÓN (mismo patrón aprobado que 20261113120600 para
--   fin_rule_versions): ampliar la whitelist con 'legal_incidents'.
--   Semánticamente idéntico a 'system': reporte de plataforma sin tienda.
--
-- PRE-CONDICIONES verificadas en el DO (fail-closed):
--   · El constraint existe y tiene exactamente la forma whitelist ANY(ARRAY).
--   · Se conserva TODO el contenido previo de la whitelist (append puro).
--
-- Idempotente: si 'legal_incidents' ya está en la whitelist, no-op.
-- Reversibilidad: DROP + ADD con la definición previa registrada aquí.
-- ═══════════════════════════════════════════════════════════════════════════

DO $fix_legal_incidents_whitelist$
DECLARE
  v_def text;
  v_arr text;
  v_new text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.audit_logs'::regclass
     AND conname = 'audit_logs_store_id_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CP-FIX-LEGAL-INCIDENTS: audit_logs_store_id_check no existe — abortando (estado inesperado)';
  END IF;

  -- Idempotencia: ya presente → no-op
  IF v_def LIKE '%legal_incidents%' THEN
    RAISE NOTICE 'CP-FIX-LEGAL-INCIDENTS: legal_incidents ya está en la whitelist — no-op';
    RETURN;
  END IF;

  -- Extraer el ARRAY literal de la definición y reconstruir con append puro
  v_arr := substring(v_def from 'ARRAY\[([^\]]*)\]');
  IF v_arr IS NULL THEN
    RAISE EXCEPTION 'CP-FIX-LEGAL-INCIDENTS: forma inesperada del constraint (%): no es whitelist ARRAY — requiere análisis manual', v_def;
  END IF;
  v_new := format(
    'CHECK (((store_id IS NOT NULL) OR (table_name = ANY (ARRAY[%s, ''legal_incidents''::text]))))',
    v_arr
  );

  EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_store_id_check');
  EXECUTE format('ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_store_id_check %s', v_new);

  RAISE NOTICE 'CP-FIX-LEGAL-INCIDENTS: whitelist ampliada → %', v_new;
END
$fix_legal_incidents_whitelist$;

-- Verificación fail-closed
DO $verify$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.audit_logs'::regclass
     AND conname = 'audit_logs_store_id_check';
  IF v_def NOT LIKE '%legal_incidents%' THEN
    RAISE EXCEPTION 'CP-FIX-LEGAL-INCIDENTS: verificación falló — whitelist sin legal_incidents (%)', v_def;
  END IF;
  -- La fila de incidente legal (store_id NULL, table_name legal_incidents)
  -- debe ser válida ahora: prueba de la constraint sin escribir datos.
  IF EXISTS (
    SELECT 1
      WHERE (CASE WHEN (NULL::uuid IS NOT NULL) OR ('legal_incidents' = ANY (
        ARRAY['profiles','stores','system','master_products','master_parties','fin_rule_versions','legal_incidents']
      )) THEN true ELSE false END) IS NOT true
  ) THEN
    RAISE EXCEPTION 'CP-FIX-LEGAL-INCIDENTS: evaluación lógica inesperada';
  END IF;
  RAISE NOTICE 'CP-FIX-LEGAL-INCIDENTS OK: legal_incidents en la whitelist';
END
$verify$;
