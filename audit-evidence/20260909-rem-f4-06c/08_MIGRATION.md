# 08_MIGRATION — aplicación y guards (§12)

Archivo: supabase/migrations/20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql
(raw: out_migration_apply.txt — incluye las 3 corridas documentadas)

## Estructura (DDL transaccional, BEGIN…COMMIT, fallo ⇒ ROLLBACK total)
1. GUARDS PRE (DO $$ … RAISE GUARD_FAIL):
   G1 tipos uuid (fiscal_closings.id / audit_logs.record_id)
   G2 fiscal_period_closures NO existe en ningún relkind
   G3 lock_fiscal_period en estado defectuoso (3 args) o ya remediado (4 args), cuerpo conocido
   G4 close_fiscal_period firma 4 args, cuerpo defectuoso o ya remediado
   G5 triggers trg_audit_fiscal_closings + prevent_fiscal_closing_edit habilitados ('O')
2. OF-1: DROP FUNCTION lock(uuid,integer,integer) + CREATE 4-args (p_user_id DEFAULT NULL,
   patrón v2_12_9, v_admin_id, locked_by=v_admin_id, puente actor set_config) +
   REVOKE ALL FROM PUBLIC/anon/authenticated + GRANT EXECUTE postgres, service_role
   (reconstrucción EXACTA de ACL w9_f06_c2; las funciones nuevas dan EXECUTE a PUBLIC
   por defecto — REVOKE obligatorio) + COMMENT.
3. OF-3: CREATE OR REPLACE close (firma idéntica 4 args) con cuerpo canónico v2_12_9
   (restauración; única diferencia documentada vs v2_12_9: search_path 'public,pg_temp'
   preservado del objeto vigente) + puente actor + COMMENT.
4. GUARDS POST: firma lock 4 args; cuerpos (v_admin_id, locked_by=v_admin_id,
   ERR_ADMIN_ONLY/ERR_NOT_CLOSED, INSERT INTO fiscal_closings, closing_id,
   ERR_UNAUTHORIZED/ERR_PERIOD_LOCKED, sin fiscal_period_closures, puente set_config);
   secdef/owner/search_path/ACL exactos; triggers 'O'; tabla fantasma ausente.

## Historial de aplicación (transparencia total)
1. Corrida 1 → FAIL G1: bug del propio gate (variables UUID vs udt_name TEXT) → ROLLBACK
   total (estado DB intacto verificado). Corregido a TEXT.
2. Corrida 2 → FAIL POST "firma lock 3 args": CREATE OR REPLACE no cambia firmas — había
   creado una 2ª función 4-args; guard POST lo detectó y ROLLBACK total (estado intacto,
   verificado en vivo: lock único 3-args, ACL/comments intactos). Solución: DROP+CREATE
   con reconstrucción de ACL (documentada en el encabezado de la migración).
3. Corrida 3 (con puente de actor §19) y re-aplicación final → RUN RESULT: OK (HTTP 201).
   Determinista e idempotente: re-ejecución acepta estado remediado (DROP IF EXISTS no-op,
   CREATE OR REPLACE idempotente, guards POST re-verifican).

## Rollback
Migración futura con los cuerpos PRE (capturados en raw out_q01_forensics.txt s02/s03).
Migraciones históricas NUNCA editadas.
