# 04 — ROOT CAUSE — REM-F4-06b

## Defecto (Finding)

`audit_fiscal_closings_changes()` — trigger function de auditoría de
`fiscal_closings` — hace que TODA operación INSERT/UPDATE sobre
`fiscal_closings` aborte con error de SQL, produciendo HTTP 500 en los
caminos de aplicación que tocan la tabla. La tabla acumula 0 filas porque
ninguna inserción ha tenido éxito desde la creación del trigger.

El defecto es COMPUESTO dentro del mismo objeto (dos errores en cadena):

**D1 (mascara)** — metadata con columnas inexistentes:
  jsonb_build_object('year', ... NEW.year ..., 'month', ... NEW.month ...)
  `fiscal_closings` nunca tuvo `year`/`month`; sus columnas son
  `period_year`/`period_month` (desde 20260726000002_v1_2, línea 146-147).
  Evaluación en runtime → SQLSTATE 42703 (record "new" has no field "year").

**D2 (objetivo nominal del gate)** — cast uuid→text contra columna uuid:
  `CASE WHEN TG_OP = 'INSERT' THEN NEW.id::text ELSE NEW.id::text END`
  asignado a `audit_logs.record_id` cuyo tipo canónico es `uuid`.
  → SQLSTATE 42804 (column "record_id" is of type uuid but expression is
  of type text). Demostrado aislado en 02_PRE_REPRO_DB (PRE-A3).

D1 se dispara ANTES que D2 (la construcción del jsonb evalúa NEW.year antes
de resolver la lista VALUES), por lo que el error visible siempre fue 42703.
Ambos deben eliminarse para que la auditoría funcione.

## Causa raíz (arqueología de migraciones)

1. `20260726000002_v1_2_..._fiscal.sql` crea `fiscal_closings` con
   `period_year INTEGER` / `period_month INTEGER` (nunca existieron year/month).
2. `20260809000004_v2_18_4_audit_triggers.sql` (14 días después) crea
   `audit_fiscal_closings_changes()` copiando el patrón de las funciones
   hermanas pero:
   - refiriendo `NEW.year`/`NEW.month` (nombres de columna incorrectos —
     probablemente copiado del dominio conceptual "year/month del periodo"),
   - añadiendo `::text` a NEW.id (patrón erróneo; las funciones hermanas de
     la MISMA migración p.ej. commission usan la misma forma defectuosa que
     ya fue corregida por gates REM-F4-06 previos — esta quedó pendiente).
3. Consecuencia: trigger inválido desde su creación. Cualquier
   INSERT/UPDATE → excepción → transacción abortada → 0 filas en la tabla y
   0 auditoría fiscal. El defecto pasó inadvertido porque ningún flujo HTTP
   de escritura de fiscal_closings está cableado de extremo a extremo
   (close escribe en fiscal_period_closures; lock HTTP está roto por OF-1),
   y la tabla permaneció vacía.

## Contrato correcto (§6 — patrón canónico verificado)

Referencia: `audit_cash_closures_changes()` — asignación directa sin cast:
  v_record_id := NEW.id        (uuid → uuid)
Aplicado a fiscal:
  record_id = NEW.id           (uuid → uuid, sin cast, sin cambio de esquema)

Los metadatos deben leer las columnas reales de la tabla:
  'year'  → NEW.period_year
  'month' → NEW.period_month
(Se conservan las CLAVES JSON 'year'/'month' del contrato de metadata
existente; se corrigen únicamente las referencias de columna.)

## Objeto exacto a modificar

UNO y solo uno:
  public.audit_fiscal_closings_changes()  (trigger function)
Preservando: owner (postgres), SECURITY DEFINER, search_path
('public','pg_temp'), firma (), trigger asociado (AFTER INSERT OR UPDATE),
eventos, semántica de auditoría (acciones FISCAL_CLOSING_CREATED/UPDATED,
mismas columnas audit_logs, mismas claves de metadata).

## Cambio exacto (3 líneas, misma declaración INSERT)

  ANTES (línea record_id):
    CASE WHEN TG_OP = 'INSERT' THEN NEW.id::text ELSE NEW.id::text END
  DESPUÉS:
    NEW.id

  ANTES (metadata):
    'year',  CASE WHEN TG_OP != 'DELETE' THEN NEW.year  ELSE NULL END,
    'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.month ELSE NULL END,
  DESPUÉS:
    'year',  CASE WHEN TG_OP != 'DELETE' THEN NEW.period_year  ELSE NULL END,
    'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_month ELSE NULL END,

## Objetos deliberadamente NO modificados

  - audit_logs (esquema, tipos, record_id sigue siendo uuid, RLS, ACL)
  - fiscal_closings (esquema, RLS, políticas, ACL, constraints, índices)
  - prevent_fiscal_closing_edit() y su trigger
  - trg_audit_fiscal_closings (definición y eventos sin cambio)
  - audit_commission_payments_changes() (REM-F4-06, verificado intacto)
  - close_fiscal_period(), lock_fiscal_period(), ensure_fiscal_period(),
    reset_store_data() (incl. su firma — ver OF-1)
  - cualquier otra función audit_*, tabla de negocio, RLS, ACL, grants
  - src/ (ningún cambio de código de aplicación en este gate — OF-1 queda
    documentado, no corregido)

## Estrategia de rollback

La migración es CREATE OR REPLACE FUNCTION (sin DDL de esquema). Rollback =
re-aplicar la definición PRE (preservada en 01_OBJECT_FORENSICS §A) con otro
CREATE OR REPLACE FUNCTION. No hay datos que revertir (la función no toca
datos existentes; solo comportamiento de escritura futura). Riesgo cero de
pérdida de datos. Se incluye raw/post-fix rollback reference:
raw/pre_function_definition.sql (definición PRE exacta capturada).

## Estrategia de pruebas

  1. POST-fix inmediato: definición sin '::text' en record_id ni NEW.year/
     NEW.month; owner/SECDEF/search_path/ACL/trigger/triggers estado 'O'
     idénticos a PRE.
  2. Funcional: INSERT (BD, ctx authenticated) → audit row
     (record_id = fiscal_closings.id, pg_typeof = uuid); UPDATE (BD, ctx
     authenticated, op exacta de lock) → audit row con OLD/NEW en metadata;
     DELETE: diferencia de contrato documentada (no auditado por diseño).
  3. Atomicidad: fallo forzado posterior a la auditoría (trigger zzz anexo
     transitorio, creado y eliminado en la misma sesión de prueba) → 0
     persistencia de negocio y auditoría; caso de éxito → ambas persistidas.
  4. Idempotencia: ensure_fiscal_period ×2 (1 fila, 1 audit), lock repetido
     (ERR_NOT_CLOSED, 0 audit adicional).
  5. Concurrencia: mismo periodo (paralelo) y cierres distintos (paralelo)
     → sin UUID cruzados ni filas mezcladas.
  6. Seguridad: anon DENY (HTTP 401), non-member DENY (RLS 0 filas + RPC
     ERR_*), cross-store DENY (close_fiscal_period ERR_UNAUTHORIZED),
     autorizado OK. ACL/RLS/SECDEF/ownership re-verificados POST.
  7. Zero-touch ENERVIDA + PUERTO PADRE: snapshot amplio PRE vs POST.
  8. Regresión: Vitest/TSC/Lint/Build/PM2/Health vs baseline.
