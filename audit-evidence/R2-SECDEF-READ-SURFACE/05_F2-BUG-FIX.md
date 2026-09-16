# REM-R2-F2BUG-FIX — Reparación de F2-BUG (`get_transfers` 42883) en producción

**Fase:** REM-R2-F2BUG-FIX (ciclo separado, aprobado por el propietario: «aprobado y recuerda hacer el push»)
**Alcance:** fix de ejecutabilidad de 1 línea en `public.get_transfers(uuid, timestamptz, timestamptz, text, integer)` — hallazgo preexistente F2-BUG, documentado en `04_R2-REMEDIATION-EXECUTION.md §5`
**Fecha:** 2026-09-16 · **Proyecto:** `wthkddeleylijmonclxg` · **Migración:** `20260916000008_rem_f2bug_transfers_status_cast.sql`
**Naturaleza del cambio:** 1 `CREATE OR REPLACE FUNCTION` con delta de exactamente 6 caracteres (`t.status` → `t.status::text`). Guard REM-R2-READ byte-idéntico. Cero mutación de datos (zero-touch bitwise 50/50).

---

## 1. CONTEXTO Y MANDATO

Durante la ejecución de R2 (fase REM-R2-READ-EXEC) se descubrió que `get_transfers` ya era **inejecutable en producción antes de R2**: el cuerpo comparaba `t.status` (columna de tipo enum `public.transfer_status`) con `p_status` (parámetro `text`). PostgreSQL no define el operador `enum = text`, por lo que la planificación de la consulta fallaba en TODA llamada — con cualquier valor de `p_status`, incluido `NULL` — con el error:

```text
ERROR: 42883: operator does not exist: transfer_status = text
```

El defecto fue reproducido en la fase R2-EXEC por SQL directo (Management API) y vía PostgREST con service_role, y quedó documentado como **F2-BUG, preexistente y fuera del alcance del guard** (el cuerpo era byte-idéntico al congelado en prep; R2 no lo introdujo ni lo agravó). Con el guard R2 activo, la superficie quedaba fail-closed: un no-miembro recibe 42501 en la barrera antes de alcanzar el SELECT roto; un miembro o service_role recibía el 42883 preexistente. Consecuencia operacional: el reporte «Transferencias» (callers C1 browser / C2 API, prep FASE 5) devolvía error a todos los usuarios desde antes de R2.

En el cierre de R2-EXEC quedó pendiente de aprobación del propietario un ciclo separado para aplicar el fix recomendado de 1 línea (`t.status::text = p_status`). El propietario aprobó el ciclo («aprobado y recuerda hacer el push»). Este informe documenta la ejecución completa de ese ciclo con la misma disciplina forense de R1/R2: PRE con drift-check, migración generada de forma determinista con self-checks, staging dinámico con enum real, aplicación a LIVE, verificación POST byte-nivel, baselines congelados y rollback function-specific.

## 2. PRE — CAPTURA Y DRIFT-CHECK (SELECT-only)

Captura fresca de LIVE (`scripts/f2bug-pre-capture.cjs`, Management API, solo SELECT) de `get_transfers` (def + meta completa), dependencias `has_store_access(uuid)` e `is_admin()` (para staging byte-exacto), el tipo real de la columna `transfers.status` y las etiquetas del enum.

| Verificación PRE | Resultado |
|---|---|
| Drift-check vs congelado POST-R2 (`04_exec-consolidated.json`) | **8/8 OK** — def, acl, secdef, volatility, config, owner, args_full, rettype idénticos |
| Guard REM-R2-READ en el cuerpo LIVE | **4/4 sondas presentes** (`auth.role() <> 'service_role'`, NULL-reject, `public.has_store_access(p_store_id)`, `ERRCODE = '42501'`) |
| Tipo de `transfers.status` | **enum `public.transfer_status`** (`typtype = e`) — confirma la causa del 42883 |
| Etiquetas del enum | `PENDIENTE`, `CONFIRMADA`, `CANCELADA`, `REVERSADA` |

Nota de serialización documentada: el campo `proconfig` en la captura congelada POST-R2 quedó almacenado como literal text[] de PostgreSQL (`{"search_path=public, pg_temp"}`), mientras que la API actual lo devuelve como array JSON nativo. El comparador normaliza ambos formatos; el valor subyacente (`search_path=public, pg_temp`) es idéntico. Este artefacto no constituye drift.

Salidas: `scripts/f2bug-pre-live.json` (captura PRE + drift-check), `/tmp/r2-dep/{is_admin,has_store_access}.sql` (deps para staging).

## 3. MIGRACIÓN — GENERACIÓN DETERMINISTA Y SELF-CHECKS

La migración se generó de forma determinista desde el cuerpo LIVE capturado (`scripts/f2bug-gen-migration.cjs`), con un único cambio: la comparación rota se sustituye por la versión con cast explícito a text.

```sql
-- PRE (roto):  AND (p_status IS NULL OR t.status = p_status)        -- enum = text → 42883
-- POST (fix):  AND (p_status IS NULL OR t.status::text = p_status)  -- text = text → OK
```

Self-checks del generador (todos ejecutados antes de escribir el archivo):

| Check | Resultado |
|---|---|
| S1 | Exactamente 1 ocurrencia de la comparación rota en el def — **PASS** |
| S2 | Reemplazo único aplicado — **PASS** |
| S3 | Guard REM-R2-READ intacto tras el reemplazo (4 sondas) — **PASS** |
| S4 | Delta de longitud = 6 chars (`::text`), único delta — **PASS** |
| S5 | Revertir el cast recupera el def original byte-a-byte — **PASS** |
| S6 | Diff línea a línea = 1 (línea 56, solo la comparación de estado) — **PASS** |

Propiedades semánticas del fix (documentadas también en el encabezado de la migración): `p_status IS NULL` corta a TRUE (el contrato NULL = todos los estados queda intacto); un `p_status` sin etiqueta válida produce conjunto vacío sin error (la comparación text=text nunca lanza); el guard R2, la firma, secdef, volatility, config, owner y ACL quedan byte-idénticos; sin DROP/GRANT/REVOKE.

## 4. STAGING — PG17 EFÍMERO CON ENUM REAL (21/21 PASS)

Staging dinámico (`scripts/f2bug-staging.cjs`, método idéntico a R2-EXEC Gate J/K: PG17.4 efímero en 127.0.0.1:55434, roles Supabase, shim `auth.uid()`/`auth.role()`, dependencias reales byte-exacto). Diferencia clave respecto al staging de R2: aquí `transfers.status` se crea con el **enum real de LIVE** con sus 4 etiquetas — el staging de R2 lo creaba como `text`, razón por la cual el 42883 no pudo reproducirse allí.

**REPRO del defecto (cuerpo PRE instalado, antes del fix) — 3/3 PASS:**

| Caso | Resultado |
|---|---|
| U1 miembro S1, `p_status` NULL | **42883** `operator does not exist: transfer_status = text` |
| U1 miembro S1, `p_status='PENDIENTE'` | **42883** (idéntico) |
| service_role, `p_store_id` S2 | **42883** (idéntico — la ruta interna también estaba rota) |

Tras aplicar la migración byte-exacta al staging: **byte-check PASS** (def instalado == statement de la migración) y matriz completa **21/21 PASS**:

| Grupo | Tests | Resultado |
|---|---|---|
| Byte + sondas | def==migración; guard 4 sondas; fix presente | 6/6 |
| Alcance | T1 U1/S1 NULL-status → 3 transferencias propias, sin TR-042 (marcador interno S2) | PASS |
| Filtro estado | T1s PENDIENTE → solo TR-041; CONFIRMADA → solo TR-041b (cast enum→text correcto) | 2/2 |
| Fail-safe | T1x estado inexistente → `[]` sin error; T1l minúsculas → `[]` (comparación text exacta) | 2/2 |
| Guard R2 | T2 tienda ajena 42501; T3 UUID desconocido 42501; T4 NULL 42501; T5 sin membership 42501 | 4/4 |
| service_role | T6 store + NULL + filtro de estado → PASS (42883 eliminado) | PASS |
| anon | T7 denegado por ACL (permission denied) | PASS |
| Regresión | EXTRA p_date_from futuro → `[]` (fechas intactas) | PASS |

Detalle de evidencia: `scripts/f2bug-staging-results.json`; resumen en `05_f2bug-consolidated.json → staging`.

## 5. APLICACIÓN A LIVE Y VERIFICACIÓN POST (28/28 OK)

Aplicación vía Management API (`scripts/apply-sql-migration.js`, misma vía que R1/R2-A/B/C): **HTTP OK** para `20260916000008_rem_f2bug_transfers_status_cast.sql` (3848 bytes). Verificación POST independiente (`scripts/f2bug-post-verify.cjs`):

| Verificación | Resultado |
|---|---|
| V1 — def LIVE == statement de la migración | **byte-equal** |
| V2 — meta vs PRE (acl, secdef, volatility, owner, args_full, rettype, argnames, config) | **intacta 8/8** |
| V3 — guard R2 (4 sondas) + fix `t.status::text` + sin rastro de línea rota | **6/6 presentes** |
| V4 — deps congeladas: `has_store_access`, `is_admin` | **byte-idénticas 2/2** |
| V5 — las otras 8 findings R2 vs congelado POST-R2 | **byte-idénticas 8/8** (cero colateral) |
| V6 — dinámico: service_role `get_transfers(SID)` → **HTTP 200** (antes 42883); con filtro `PENDIENTE` → HTTP 200 | **2/2** |
| V7 — dinámico: anon → **HTTP 401** | PASS |

Con este fix, el panel dinámico service_role pasa de 8/9 a **9/9 HTTP 200**: `get_transfers` vuelve a ser ejecutable en producción, ahora con autorización (guard R2) y ejecutabilidad (este fix) simultáneas.

## 6. BASELINES CONGELADOS Y ZERO-TOUCH

| Métrica | PRE | POST | Estado |
|---|---|---|---|
| Layer A (contrato LIVE de escritura) | 141/141 · 0 violaciones · PIN REM-INV-2R OK | **141/141 · 0 violaciones · PIN OK** | intacto, sin renumerificar |
| Layer B (migraciones) + Layer C (reconciliación) | CONTRATO OK | **CONTRATO OK · 141/141 · 0 divergencias · mismos 9 LOW** | intacto |
| Zero-touch (count + md5(ids), 7 tablas × 50 tiendas) | capturado | **50/50 BITWISE IDENTICAL** | cero mutación de datos |
| Tenants protegidos | ENERVIDA-VITALLCONS · Puerto Padre VITALLCONS | **BITWISE IDENTICAL** | sin toque |
| Regla de cobertura | `Existing contract: 141` | sin cambio — F2-BUG es fix de ejecutabilidad, no guard nuevo | 141 sin renumerificar |

## 7. ROLLBACK (function-specific)

El cuerpo PRE congelado de este ciclo está en `scripts/f2bug-pre-live.json → get_transfers.def` (demostrado vigente por el drift-check 8/8 pre-despliegue). Para revertir exactamente esta función:

```sql
CREATE OR REPLACE FUNCTION public.get_transfers(p_store_id uuid, p_date_from timestamptz DEFAULT NULL, p_date_to timestamptz DEFAULT NULL, p_status text DEFAULT NULL, p_limit integer DEFAULT 1000)
<...cuerpo PRE byte-a-byte desde f2bug-pre-live.json...>;
```

(Sin cambios de ACL/grants en esta fase — el rollback es solo del cuerpo. Tras cualquier revert: re-ejecutar POST + Layer A hasta 141/141.) El revert restaura deliberadamente el 42883 preexistente y NO toca el guard R2, que viaja dentro del mismo cuerpo congelado.

## 8. EVIDENCIA PRODUCIDA

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20260916000008_rem_f2bug_transfers_status_cast.sql` | migración única (def generado + encabezado forense) |
| `05_F2-BUG-FIX.md` | este informe |
| `05_f2bug-consolidated.json` | PRE + drift-check + staging 21/21 + POST 28/28 + zero-touch 50/50 |
| `MANIFEST.sha256` | regenerado (12 archivos) |
| `scripts/f2bug-pre-capture.cjs` · `f2bug-gen-migration.cjs` · `f2bug-staging.cjs` · `f2bug-post-verify.cjs` · `f2bug-assemble-evidence.cjs` | herramienta forense re-ejecutable |

---

R1: REMEDIATED AND VERIFIED
R2: REMEDIATED AND VERIFIED
R2 REMEDIATION: EXECUTED
F2-BUG: FIXED AND VERIFIED
PRODUCTION CHANGES THIS PHASE: 1 FUNCTION BODY FIX (1 MIGRATION, ZERO DATA MUTATIONS)
