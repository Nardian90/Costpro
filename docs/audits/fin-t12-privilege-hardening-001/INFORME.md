# CP-FIN-T12-PRIVILEGE-HARDENING-001 — Auditoría y restricción de EXECUTE de `fin_entry_reversal_residual`

**Fecha:** 2026-11-16 · **PR:** #1632 (`fix/fin-t12-privilege-hardening-20261116` → main) · **Migración correctiva:** `supabase/migrations/20261116120000_cp_fin_t12_privilege_hardening.sql` · **Estado:** aplicación a producción PENDIENTE de autorización de despliegue (runbook `scripts/m056-fin-t12-privilege-deploy.mjs`)

---

## 1. Hallazgo

La migración T12 (`20261115100000_cp_fin_t12_partial_reversal_guard.sql`, aplicada a producción el 2026-11-15 12:26 UTC — libro `production_migration_ledger` id 61) concedió `EXECUTE` a `authenticated` sobre el helper `fin_entry_reversal_residual(uuid)` (línea 177 del archivo T12):

```sql
GRANT EXECUTE ON FUNCTION public.fin_entry_reversal_residual(uuid) TO authenticated, service_role;
```

El helper es **SECURITY DEFINER** (owner `postgres`), **de solo lectura** sobre `fin_entries`/`fin_movements` (tablas con **RLS enabled + FORCED**) y **sin verificación de identidad ni de tienda**: un usuario `authenticated` podía invocarlo directamente vía PostgREST (`POST /rest/v1/rpc/fin_entry_reversal_residual`) con **cualquier uuid** y obtener la desviación agregada entre un asiento y sus reversiones de **arbitraria tienda** — elusión de RLS y fuga de agregados financieros entre tenants.

## 2. Diagnóstico (read-only sobre producción, sin modificación)

Evidencia en este directorio (scripts `m054` / `m054b`):

| Consulta | Resultado |
|---|---|
| Q1 libro de migraciones | T12 aplicada (id 61); CP-004 aplicada (ids 62/63) |
| Q2 definición del helper | owner `postgres`, `SECURITY DEFINER`, SQL STABLE, `search_path` fijado |
| Q3 ACL efectiva | grants: `postgres`, `authenticated`, `service_role` (OID 16384/16481/16482) |
| Q4 `has_function_privilege` | **authenticated=TRUE (hallazgo vigente)**, anon=FALSE, service_role=TRUE |
| Q5 invocadores en BD | solo `fin_post_document_annulment(text,uuid)` y `fin_t12_block_receipt_annulment()` — ambos SECURITY DEFINER owner postgres (el trigger con 1 trigger asociado) |
| Q6 RLS fin_* | `fin_entries`, `fin_movements`, `fin_posting_errors`: RLS enabled+FORCED |
| Q7 superficie RPC `fin_*` | el helper es el ÚNICO de la familia con EXECUTE para authenticated sin ser punto de entrada con autorización propia |
| Gate SQL EN VIVO | **FALLO**: `secdef_no_auth` con 1 hallazgo no cubierto = `fin_entry_reversal_residual` (evidencia `sql-security-gate-ANTES.json`) |
| Drift LIVE↔T12 | sin drift real (solo el `;` final que omite `pg_get_functiondef` — verificación byte a byte del cuerpo) |

**Callers revisados:** frontend/app no invoca el helper (búsqueda en el repo: solo migración T12, batería SQL, script de regresión m052 y este expediente). No hay RPC público que lo exponga. Las pruebas SQL lo invocan como owner (postgres).

**Allowlist revisada:** la única entrada añadida recientemente al SQL Security Gate por el ciclo T12 (commit dd05a50d1, PR #1628) fue `fin_post_document_annulment/2` en `source_of_truth_baseline` (regla `BODY_DRIFT_FROM_MIGRATION`), cuya condición («pendiente de aplicar a producción») quedó **satisfecha con la aplicación de T12 (libro id 61)** — se retira en este PR tras regenerar el contract-surface desde LIVE y verificar ausencia de drift. El helper NO tenía entrada en `security_definer_without_auth_check` (era lo que rompía el gate); se le añade una clasificada `helper-interno` (idéntica clase que sus 115 hermanos `fin_*`).

## 3. Decisión de privilegio mínimo (justificación de cada GRANT/REVOKE)

Semántica PostgreSQL aplicada: el privilegio EXECUTE se comprueba **en cada llamada contra el rol efectivo del momento**; dentro de una función SECURITY DEFINER el rol efectivo es el **propietario**, por lo que las llamadas anidadas del motor/trigger T12 se comprueban contra `postgres` y **no dependen de grants externos**.

| Rol | Decisión | Justificación |
|---|---|---|
| `authenticated` | **REVOKE** | sin llamador legítimo directo; el residual se calcula dentro de los llamadores SECURITY DEFINER; elimina la elusión de RLS |
| `anon` | **REVOKE** (re-afirmación) | defensa en profundidad; T12 ya lo revocaba |
| `PUBLIC` | **REVOKE** (re-afirmación) | el default de ACL de función es EXECUTE a PUBLIC; se explicita para que ninguna redefinición futura lo restaure |
| `service_role` | **GRANT (conservado, explícito)** | procesos server-side del backend conservan capacidad de operación/diagnóstico |
| `postgres` (owner) | **implícito, intacto** | rol efectivo de los llamadores internos SECURITY DEFINER; privilegio de propietario no revocable |

No se modifica ninguna otra función financiera (alcance mínimo). Las funciones SECURITY DEFINER que dependen del helper quedan operativas (demostrado E2E).

## 4. Migración correctiva

`20261116120000_cp_fin_t12_privilege_hardening.sql` — nueva e inmutable (no edita T12 ni ninguna migración aplicada):

- **Idempotente**: REVOKE/GRANT/COMMENT idempotentes por construcción; demostrado en E2E con doble aplicación (m055 P1a/P1b).
- **Precondiciones fail-closed**: helper y llamadores T12 presentes; owner = postgres; aborta si el orden del replay es incorrecto.
- **Postcondiciones fail-closed**: authenticated/anon/PUBLIC sin EXECUTE; service_role y owner con EXECUTE; cualquier desviación aborta la migración.
- **Sin datos**: no toca datos financieros, movimientos históricos ni resultados contables (solo ACL + COMMENT de catálogo).
- **Libro de migraciones**: la fila en `production_migration_ledger` la escribe el runbook de despliegue autorizado (m056, paso 3) en el momento de la aplicación, como el resto de migraciones del repo.

## 5. Pruebas (BD aislada `lguovmvrozxgssupkwpf`, producción INTACTA)

Orquestador `scripts/m055-fin-t12-privilege-e2e.mjs` — **10/10 PASS** (evidencia `e2e-privilege-hardening.json`):

1. **P2a/P2b — ACL antes/después**: `authenticated: true → false`; anon/PUBLIC=false; service_role/owner=true.
2. **P1a/P1b — idempotencia**: migración aplicada ×2 sin error ni cambios.
3. **Batería SQL** (`supabase/tests/cp_fin_t12_privilege_hardening_test.sql`, C1–C9): denegaciones REALES por `SET LOCAL ROLE` (anon/authenticated/rol-sin-grants → permission denied), ejecución OK como service_role y owner, cadenas internas operativas (motor contabiliza, reversión parcial bloqueada por el trigger T12, regularización rehabilita el cauce ordinario), **resultados contables idénticos a la batería T12** (compensatorio único, original `reversed`, residual 2000/0, sin 2ª compensación), limpieza total.
4. **P6 — regresión 0**: la batería T12 existente (`cp_fin_t12_partial_reversal_guard_test.sql`) se re-ejecuta completa tras la migración correctiva → PASS.
5. **P3a/P3b/P4 — PostgREST REAL**: anon → HTTP 401 (denegado); usuario `authenticated` REAL (creado y eliminado vía cauce canónico `e2e_hard_delete_user`) → HTTP 403 (denegado); service_role → HTTP 200 con resultado numérico (capacidad server-side intacta).
6. **P7 — net delta 0**: stores/asientos/rol/usuarios de prueba = 0 residuos.

Gates locales del PR: SQL Security Gate EN VIVO (TODO PASS, `sql-security-gate-DESPUES.json`), security contract estático (3 capas, 208 funciones), check-destructive-guard, check-writers, replay `--check` MATCH, ESLint, suite vitest (6066 PASS — los 3 ajustes de conteo/declaración actualizados).

## 6. Despliegue (PENDIENTE de autorización)

Por el mandato §5 la migración **NO se aplica a producción** en este PR. Runbook listo y fail-closed: `scripts/m056-fin-t12-privilege-deploy.mjs`

```
set -a && source .env && set +a
node scripts/m056-fin-t12-privilege-deploy.mjs --autorizado-por="<quién/cuándo>"
```

(Exige además los dobles flags del guard canónico: `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`.) Secuencia: pre-chequeo de permisos vigentes → aplicación → registro en el libro → verificación post. Verificado fail-closed: sin `--autorizado-por` aborta (exit 2); con flag pero sin doble flag aborta en el guard (exit 1) antes de ninguna petición.

**Criterio de cierre**: ① el helper queda sin exposición directa (al aplicar la migración) ② las operaciones financieras autorizadas siguen pasando sus pruebas (demostrado en aislada) ③ los no autorizados reciben denegación (demostrado REST + SQL) ④ los gates pasan sin ocultar el hallazgo (la excepción `helper-interno` es la misma clase justificada de la familia fin_*; el GRANT cuestionado se elimina por migración, no por excepción) ⑤ libro y expediente conciliados (incluida la recuperación al repo de las 2 migraciones CP-004 faltantes, SHA-256 verificados contra el libro ids 62/63, sin las cuales la capa C del contrato bloqueaba el build).

## 7. Contenido del PR

- `supabase/migrations/20261116120000_cp_fin_t12_privilege_hardening.sql` — corrección.
- `ci-gate-allowlist.json` — +1 entrada `helper-interno` (fin_entry_reversal_residual); −1 entrada `BODY_DRIFT` obsoleta (fin_post_document_annulment/2, condición satisfecha).
- `supabase/security-contract/contract-surface.sql` — re-certificado desde LIVE (208 funciones; incluye el guard T12).
- `audit-evidence/INFRA-011/e2e-migrations-manifest.json` — regenerado (175 incluidas).
- `supabase/migrations/20261115120000_…` y `20261115120100_…` — recuperación CP-004 (SHA verificados contra libro 62/63).
- `supabase/tests/cp_fin_t12_privilege_hardening_test.sql`, `scripts/m054/m054b/m055/m056`, evidencia JSON de este directorio, manifiesto de escritores, ajuste de conteo del test de replay.

## 8. Conciliación con el PR #1631 (CP-VALUATION-NOMINAL-ACTIVATION-004)

Mientras este PR estaba abierto, **#1631 fusionó la rama CP-004** (que incluía las
mismas 2 migraciones recuperadas — byte-idénticas, sin conflicto — y una entrada
propia del helper en la allowlist que documentaba la RECOMENDACIÓN de restringir
el GRANT). El merge de main en esta rama (commit afa02d269) concilió:

- `ci-gate-allowlist.json`: las 2 entradas del helper se fusionaron en UNA
  (razón enriquecida: la recomendación queda cumplida por 20261116120000;
  expira 2027-06-30, estándar de la familia fin_*).
- `writers.manifest.json`: unión de ambos lados (val004-* + m054/m054b/m055/m056).
- Test de replay: 175 con comentarios combinados (+2 CP-004 con PR #1631, +1 este PR).
- contract-surface y manifiesto replay: nuestra captura (más reciente);
  `--check` MATCH; contrato estático 3 capas OK; gate EN VIVO TODO PASS;
  check-writers OK; 82/82 tests de los 2 archivos afectados.
