-- =====================================================================
-- scripts/ops/production_migration_ledger_seed.sql — T2 D2.2 (siembra mínima y honesta)
-- ============================================================================
-- EJECUCIÓN: EXCLUSIVAMENTE en PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) y
-- SOLO con la compuerta literal del propietario:
--     AUTORIZO LEDGER PROD
-- Sin esa frase exacta NO ejecutar (misión: cero escrituras en producción sin
-- su frase). Probado en CostproE2E con filas de prueba etiquetadas (ver
-- audit-evidence/T2-LEDGER/). Idempotente: guard previo por versión —
-- re-ejecutar no duplica (el trigger SOLO-ADICIÓN bloquea UPDATE/DELETE).
--
-- Qué SIEMBRA (y qué NO):
--  (a) UNA fila 'baseline' que declara: todo lo anterior a la fecha es de
--      PROCEDENCIA NO REGISTRADA; la huella es la del catálogo medido en T0.
--  (b) SOLO filas para aplicaciones con evidencia directa YA EXISTENTE:
--      * 20261022000001 (CP-SEC-003) y 20261022000002 (UI-001 opción B) —
--        aplicadas en producción 2026-11-04
--        (evidencia: audit-evidence/CP-SEC-003_UI-001/EVIDENCIA_PRODUCCION.md).
--      * 20261103000001 (CP-SEC-026 trigger auditoría membresías) — sha256
--        594f9312c7a35f7eb7685e5d593d4374bd75d50a5cb20d03bd3708879c03ea53
--        (evidencia: audit-evidence/CP-SEC-026/EVIDENCIA_PRODUCCION.md).
--  NO SE INVENTAN filas para el resto del historial (anti-patrón: backfill masivo).
-- =====================================================================
BEGIN;

-- Guard de idempotencia: si el baseline ya está sembrado, no hacer nada.
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version = 'BASELINE-2026-11-06') THEN
    RAISE NOTICE 'ledger: baseline ya sembrado — no se duplica (SOLO-ADICIÓN)';
    RETURN;
  END IF;
END
$seed$;

-- (a) baseline: procedencia no registrada, huella T0 [MEDIDO 2026-11-06]
INSERT INTO public.production_migration_ledger
  (version, file, sha256, mechanism, evidence, applied_by, status, notes)
VALUES
  ('BASELINE-2026-11-06', '(baseline: estado del catálogo medido por T0)',
   'huella por función en audit-evidence/T0-DERIVA/huellas-md5-prod.json · resumen en audit-evidence/T0-DERIVA/base-linea.json',
   'owner_manual', 'audit-evidence/T0-DERIVA/', 'owner', 'baseline',
   'Todo lo anterior a esta fecha tiene PROCEDENCIA NO REGISTRADA en producción: 534 migraciones SQL en el repo, 12 filas en supabase_migrations.schema_migrations (última 20260615000003). El estado real está en la huella T0 (309 funciones SECURITY DEFINER) y en la deriva documentada (docs/audits/DERIVA_PRODUCCION_VS_REPO_2026-11-06.md). A partir de aquí: todo cambio de esquema = migración versionada + fila en este libro + evidencia + informe de deriva posterior.');

-- (b) aplicaciones con evidencia directa (sha256 del CONTENIDO del archivo en el repo, calculado 2026-11-06)
INSERT INTO public.production_migration_ledger
  (version, file, sha256, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261022000001', 'supabase/migrations/20261022000001_cp_sec_003_products_update_policy_consolidation.sql',
   '7d7432443e91363b24fe319fa899ef786142808b0819a2a86362a061ad90d587',
   'owner_manual', 'audit-evidence/CP-SEC-003_UI-001/EVIDENCIA_PRODUCCION.md', 'owner', 'applied',
   'CP-SEC-003 consolidación de política UPDATE de products. Aplicada en producción 2026-11-04 con compuerta literal del propietario (opción B).'),
  ('20261022000002', 'supabase/migrations/20261022000002_cp_ui_001_commission_payments_no_overlap.sql',
   'e914ffbc00205d0aee13a20945329d6b1ae3663cc7630a45d382879620e28b06',
   'owner_manual', 'audit-evidence/CP-SEC-003_UI-001/EVIDENCIA_PRODUCCION.md', 'owner', 'applied',
   'CP-UI-001 opción B: restricción de exclusión commission_payments_no_overlap. Aplicada en producción 2026-11-04. NOTA T3: está DUPLICADA con no_overlapping_periods (20260714000001); su retirada planificada requiere la frase AUTORIZO UI-001 LIMPIEZA PROD.'),
  ('20261103000001', 'supabase/migrations/20261103000001_cp_sec_026_membership_audit_trigger.sql',
   '594f9312c7a35f7eb7685e5d593d4374bd75d50a5cb20d03bd3708879c03ea53',
   'management_api', 'audit-evidence/CP-SEC-026/EVIDENCIA_PRODUCCION.md', 'owner', 'applied',
   'CP-SEC-026: trigger de auditoría de membresías (trg_sec026_membership_audit). Aplicada con verificación por catálogo.');

COMMIT;
