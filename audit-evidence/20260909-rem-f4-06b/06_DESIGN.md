# 06 — DESIGN — REM-F4-06b (§8)

1. **Defecto.** `audit_fiscal_closings_changes()` (trigger AFTER INSERT OR
   UPDATE de `fiscal_closings`) aborta toda escritura de la tabla: (D1)
   metadata referencia `NEW.year`/`NEW.month` inexistentes → SQLSTATE 42703;
   (D2) asigna `NEW.id::text` a `audit_logs.record_id` (uuid) → SQLSTATE
   42804. D1 enmascara D2. Tabla con 0 filas, 0 auditoría fiscal, HTTP 500
   en caminos de aplicación.

2. **Causa raíz.** La migración 20260809000004_v2_18_4_audit_triggers.sql
   escribió la función con nombres de columna conceptuales (year/month) que
   nunca existieron (la tabla nació con period_year/period_month en
   20260726000002) y con un cast `::text` contrario al contrato canónico
   uuid→uuid (`audit_cash_closures_changes`: `v_record_id := NEW.id`).

3. **Contrato correcto.** `record_id = NEW.id` (uuid directo). Metadatos leen
   columnas reales `NEW.period_year`/`NEW.period_month` conservando las
   claves JSON 'year'/'month'. Mismas acciones (FISCAL_CLOSING_CREATED /
   FISCAL_CLOSING_UPDATED), mismas columnas de audit_logs, mismo user_id
   (auth.uid()), mismo RETURN NEW.

4. **Objeto exacto a modificar.** Uno y solo uno:
   `public.audit_fiscal_closings_changes()` vía migración nueva
   `20260909000003_rem_f4_06b_audit_fiscal_closing_record_id_uuid.sql`
   (CREATE OR REPLACE FUNCTION; NO se editan migraciones históricas).

5. **Cambio exacto.** 3 líneas dentro de la misma declaración INSERT:
   - `CASE WHEN TG_OP='INSERT' THEN NEW.id::text ELSE NEW.id::text END` → `NEW.id`
   - `NEW.year` → `NEW.period_year`  (clave 'year' se conserva)
   - `NEW.month` → `NEW.period_month` (clave 'month' se conserva)
   Todo lo demás byte-idéntico a la definición PRE (capturada en
   01_OBJECT_FORENSICS §A y raw/pre_function_definition.sql).
   Nota de alcance: D1 es intra-objeto y NECESARIO — sin él, corregir solo
   D2 dejaría la auditoría rota (42703) y los criterios §24 (INSERT/UPDATE
   PASS) imposibles. Documentado como desviación regida por la condicional
   de §5 ("si esa es la única corrección necesaria") y por el OBJETIVO FINAL.

6. **Objetos deliberadamente NO modificados.** audit_logs (tipos/RLS/ACL),
   fiscal_closings (esquema/RLS/ACL), prevent_fiscal_closing_edit(),
   trg_audit_fiscal_closings (definición/eventos), las demás audit_*,
   close/lock/ensure/reset RPCs, src/, grants, production stores.
   Hallazgos hermanos OF-1 (wiring ruta lock→RPC) y OF-2 (trazabilidad
   REM-F4-06) documentados sin corregir (05_SIBLING_CENSUS).

7. **Estrategia de rollback.** CREATE OR REPLACE FUNCTION es reversible sin
   riesgo: re-aplicar la definición PRE (raw/pre_function_definition.sql)
   con otro CREATE OR REPLACE. Sin DDL de esquema, sin datos, transaccional
   (los guards POST con RAISE hacen rollback total si algo falla).

8. **Estrategia de pruebas.** Guards PRE (tipos uuid, objetos, trigger
   habilitado, estado defectuoso esperado o ya-remediado) y guards POST
   (sin ::text, period_year/month presentes, SECDEF/search_path/owner
   preservados, trigger 'O'). Suite: funcional INSERT/UPDATE (+ DELETE como
   diferencia de contrato), integridad uuid (record_id = id, pg_typeof),
   atomicidad (fallo forzado post-auditoría), idempotencia
   (ensure×2, lock repetido), concurrencia (mismo cierre / cierres
   distintos), seguridad (anon/non-member/cross-store/authorized, RLS,
   ACL), zero-touch ENERVIDA + PUERTO PADRE PRE==POST, regresión completa
   (Vitest/TSC/Lint/Build/PM2/Health) vs baseline §18.
