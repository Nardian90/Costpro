# R2 SECDEF-READ SURFACE — REMEDIATION EXECUTION (REM-R2-READ-EXEC)

timestamp: 2026-09-16 · alcance: Supabase LIVE `wthkddeleylijmonclxg` · cadena de commits: `fa0a3b22 → eeedc5b9 → f81fafca → 276d143f → e1cdad2d` (base de esta fase)

NATURALEZA DE ESTA FASE: **EJECUCIÓN de la remediación preparada** en `02_REMEDIATION-PREP.md` (Modelo A, guard precede 000004). Orden del propietario: «adelante, orden dada de ejecución». Despliegue quirúrgico en 3 lotes (R2-A/B/C), con captura PRE, staging dinámico, verificación por lote byte-a-byte, contrato de seguridad completo y zero-touch bitwise.

---

## 1. PRE-EJECUCIÓN (estado congelado, read-only)

| Verificación | Resultado |
|---|---|
| Drift de las 9 findings + `has_store_access` vs captura congelada de prep (`03_prep-live-capture.json`) | **0 drift — byte-idénticas** (script `r2-exec-pre-capture.cjs`) |
| Zero-touch PRE (ENERVIDA-VITALLCONS, Puerto Padre VITALLCONS — 7 tablas + md5 ids) | capturado (`04_exec-consolidated.json → zero_touch.pre`) |
| Layer A (contrato LIVE de escritura) | **141/141 · 0 violaciones · PIN REM-INV-2R OK** |
| ACL de las 9 (proacl + aclexplode) | `{postgres=X, authenticated=X, service_role=X}` · anon sin EXECUTE — sin cambios respecto a prep |

---

## 2. GENERACIÓN DE MIGRACIONES (determinista, auditable)

Generador: `scripts/r2-gen-migrations.cjs` — fuente única: cuerpos LIVE congelados en prep. Self-checks por función (todos PASS):

```text
S1 guard presente exactamente 1 vez            S3 prólogo byte-idéntico (salvo LANGUAGE en F4b)
S2 generado − guard == def PRE byte-a-byte     S4 cabecera CREATE OR REPLACE intacta
```

| Migración | Fase | Funciones | Transform |
|---|---|---|---|
| `20260916000005_rem_r2_a_high_read_guards.sql` | R2-A | `get_cash_closures`, `get_transfers` | plpgsql + guard |
| `20260916000006_rem_r2_b_medium_read_guards.sql` | R2-B | `get_store_analytics_advanced`, `get_sales_since_last_closure`, `get_paginated_products`, `get_products_for_reception`, `get_product_stock_ledger_paginated` | plpgsql + guard |
| `20260916000007_rem_r2_c_low_read_guards.sql` | R2-C | `get_daily_expenses_aggregated`, `get_low_stock_count` | plpgsql + guard · **F4b: `LANGUAGE sql → plpgsql`** |

Guard insertado (idéntico al precedente `20260916000004`, con rama NULL de prep FASE 4/7):

```sql
IF auth.role() <> 'service_role' THEN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
  END IF;
END IF;
```

**Ajuste estructural PREP→EXEC (documentado):** prep FASE 7 asumía las 9 en plpgsql; `get_low_stock_count` es `LANGUAGE sql`. Para honrar el contrato 42501 se convirtió a plpgsql envolviendo su SELECT **byte-idéntico (CRLF incluido)** en `RETURN (...)`. Resto de cabecera (RETURNS/SECDEF/search_path/owner/ACL) intacto. Cero otros cambios de firma/ACL/owner/volatilidad/search_path en las 9.

---

## 3. STAGING DINÁMICO (PostgreSQL 17.4 efímero, método REM-INV-6R Gate J/K)

`scripts/r2-guard-staging.cjs` — cluster efímero con roles Supabase replicados (anon/authenticated/service_role), shim `auth.uid()/auth.role()`, dependencias REALES (`is_admin`, `has_store_access` byte-exactas desde LIVE), 2 tiendas con marcadores cross-store.

**REPRO (cuerpos PRE) — la vulnerabilidad existía y es explotable: 10/10 PASS**

| Ataque como U1 (miembro solo de S1) | Resultado PRE |
|---|---|
| `get_cash_closures(NULL)` / `(S2)` | cierres de S2 (999.99) visibles |
| `get_transfers(NULL)` | transferencia interna de S2 visible |
| `get_store_analytics_advanced(S2)` | ventas de S2 (500) visibles |
| `get_sales_since_last_closure(S2)` | total_sales de S2 = 500 |
| `get_paginated_products(S2)` | catálogo S2 con costos |
| `get_products_for_reception(S2)` | productos S2 visibles |
| `get_product_stock_ledger_paginated(NULL)` | movimiento de P1 en S2 (unit_cost 22.50) |
| `get_daily_expenses_aggregated(NULL)` | gastos de S2 (777.77) visibles |
| `get_low_stock_count(NULL)` | conteo global incluye S2 |

**Matriz T1-T7 × 9 tras aplicar las 3 migraciones (bytes exactos): 63/63 PASS**

| Test | Resultado |
|---|---|
| T1 miembro + tienda propia → PASS + datos SOLO de esa tienda (aserción de alcance por función) | 9/9 |
| T2 tienda ajena → 42501 `ERR_UNAUTHORIZED_STORE` | 9/9 |
| T3 UUID manipulado/desconocido → 42501 | 9/9 |
| T4 NULL → 42501 (contrato; elimina NULL=todas) | 9/9 |
| T5 usuario sin membership → 42501 | 9/9 |
| T6 service_role → PASS (con tienda y con NULL: capacidad operativa conservada) | 9/9 |
| T7 anon → denegado por ACL (`permission denied`) | 9/9 |

**Byte-check staging: 9/9** (`pg_get_functiondef` == statement de migración). T8-T10 (arrays): N/A — ninguna de las 9 recibe arrays (regla fail-closed registrada en prep; caso array cubierto por R1/KPI).

**STAGING TOTAL: 82/82 PASS** (`04_exec-consolidated.json → staging`)

---

## 4. DESPLIEGUE LIVE POR LOTES (Management API, mismo canal que R1)

Canal: `scripts/apply-sql-migration.js` → `api.supabase.com/v1/projects/.../database/query`. Verificación por lote: `scripts/r2-exec-verify.cjs` (V1 byte · V2 meta · V3 guard · V4 dinámico HTTP · FREEZE dependencias).

| Lote | Migración | Verificación |
|---|---|---|
| R2-A | `20260916000005` | **13/14 OK** — V1 byte 2/2 · V2 meta 2/2 · V3 guard 2/2 · V4 service_role: cash 200 / transfers 404* · anon 401 2/2 · FREEZE 2/2 |
| R2-B | `20260916000006` | **32/32 OK** — las 5 funciones: byte, meta, guard, service_role 200, anon 401, FREEZE |
| R2-C | `20260916000007` | **14/14 OK** — idem |

\* `V4 get_transfers service_role: HTTP 404` — **no es un fallo del guard**: ver §5.

---

## 5. HALLAZGO NUEVO F2-BUG (preexistente, FUERA DEL ALCANCE DEL GUARD, no introducido por R2)

Durante la verificación dinámica se descubrió que **`get_transfers` ya era inejecutable en producción ANTES de esta fase**:

```text
ERROR: 42883: operator does not exist: transfer_status = text
```

- Causa: el cuerpo (byte-idéntico al congelado en prep, es decir, el estado previo a R2) compara `t.status` (enum `transfer_status`) con `p_status` (text) — PostgreSQL no tiene el operador `enum = text` → error de planificación en TODA llamada, con cualquier valor de `p_status` (incluido NULL).
- Reproducido por SQL directo (Management API) y vía PostgREST con service_role — ambas rutas 42883.
- Consecuencia operacional: el reporte «Transferencias» (callers C1 browser / C2 API, prep FASE 5) ya devolvía error a todos los usuarios antes de R2. **R2 no cambia este comportamiento funcional** (el cuerpo SELECT es byte-idéntico).
- Efecto del guard sobre este defecto: la superficie queda más fail-closed — un no-miembro recibe 42501 en la barrera ANTES de llegar al SELECT roto; un miembro/service_role recibe el 42883 preexistente. **Cero fuga de datos por esta vía en cualquier caso.**
- Fix recomendado (UNA línea, fuera de este mandato, requiere su propio ciclo prep→staging→LIVE): `AND (p_status IS NULL OR t.status::text = p_status)` (o `t.status = p_status::transfer_status` tras validar el valor).
- Estado: DOCUMENTADO como F2-BUG; no se tocó el cuerpo fuera del guard (principio de mínima intervención y regla de rollback byte-a-byte de la prep).

---

## 6. VERIFICACIÓN FINAL LIVE

| Verificación | Resultado |
|---|---|
| Captura POST de las 9 + dependencias (`r2-exec-post-live.json`) | 9/9 con guard byte-igual a las migraciones; `has_store_access`/`is_admin` byte-idénticas a PRE (FREEZE 3 lotes × 2 deps) |
| Meta de las 9 vs PRE | acl / secdef / volatility / config / owner / argnames / rettype **intactos 9/9** |
| Layer A (contrato LIVE de escritura) | **141/141 · 0 violaciones · PIN REM-INV-2R OK** — sin cambios |
| Layer B (migraciones) + Layer C (reconciliación) | **CONTRATO OK · 141/141 representadas · 0 divergencias · mismos 9 LOW preexistentes** (SEARCH_PATH_NOT_SET) |
| Zero-touch bitwise (PRE vs POST) | **ENERVIDA-VITALLCONS: BITWISE IDENTICAL · Puerto Padre VITALLCONS: BITWISE IDENTICAL** (7 tablas + md5 ids; ver `04_exec-consolidated.json → zero_touch`) |
| Dinámico LIVE | service_role: 8/9 HTTP 200 (get_transfers → 42883 preexistente, §5) · anon: 9/9 denegado (401) |
| Cobertura | `Existing contract: 141 · New R2 coverage: 9 guards + 63 tests T1-T7 (staging) · Total: 141 + 9` — el baseline 141/141 NO se renumerifica ni sustituye |

---

## 7. ROLLBACK (disponible, function-specific)

PRE bodies congelados byte-nivel en `03_prep-live-capture.json` (y demostrados vigentes por el drift-check 0 pre-despliegue). Para revertir UNA función:

```sql
CREATE OR REPLACE FUNCTION public.<fn>(<firma PRE>) ... AS '<cuerpo PRE byte-a-byte>';
REVOKE ALL ON FUNCTION public.<fn>(<firma PRE>) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.<fn>(<firma PRE>) TO postgres, authenticated, service_role;
```

(Nunca rollback genérico por lote; re-ejecutar POST + Layer A hasta 141/141 tras cualquier revert.)

---

## 8. CRITERIOS DE ÉXITO (de prep «EJECUCIÓN FUTURA», verificados)

| # | Criterio | Estado |
|---|---|---|
| 1 | 9/9 funciones con guard | ✅ (V1/V3 en 3 lotes: byte == migración, guard×1, 42501 msgs) |
| 2 | Layer A 141/141 | ✅ |
| 3 | Estático sin divergencias nuevas | ✅ (B/C: 0 divergencias, mismos 9 LOW) |
| 4 | T1-T7 en staging 9×7 PASS | ✅ 63/63 (+ REPRO 10/10 + byte-check 9/9 = 82/82) |
| 5 | Zero-touch en tenants protegidos (bitwise) | ✅ 2/2 |
| 6 | Baseline sin renumerificación | ✅ (141 se reporta como base; cobertura R2 aditiva) |
| 7 | Dependencia `has_store_access` congelada | ✅ (FREEZE byte-idéntica tras cada lote) |
| 8 | Cero cambios ACL/firma/owner/volatilidad/search_path | ✅ (V2 9/9; única excepción documentada: F4b LANGUAGE sql→plpgsql) |
| 9 | Rollback function-specific disponible | ✅ (§7) |
| 10 | Ajustes estructurales documentados | ✅ (F4b §2; F2-BUG §5) |

Limitación declarada (misma convención que R1): los casos authenticated (T1-T5) no son ejecutables dinámicamente en LIVE sin JWT real (prohibido crear usuarios en producción); su cobertura es staging con cuerpos reales + igualdad byte-a-byte de los cuerpos LIVE vs staging. En LIVE quedan verificados dinámicamente service_role (8/9 200 + 1 preexistente 42883) y anon (401 9/9), más la verificación estructural byte.

---

## 9. EVIDENCIA PRODUCIDA

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20260916000005_rem_r2_a_high_read_guards.sql` | R2-A (F1, F2) |
| `supabase/migrations/20260916000006_rem_r2_b_medium_read_guards.sql` | R2-B (F3a-e) |
| `supabase/migrations/20260916000007_rem_r2_c_low_read_guards.sql` | R2-C (F4a, F4b) |
| `04_exec-consolidated.json` | PRE/POST captures · staging 82/82 · verificación 3 lotes · zero-touch PRE/POST |
| `04_exec-batch-verification.json` | resumen por lote (59/60 checks OK; único fail = F2-BUG §5) |
| `scripts/r2-gen-migrations.cjs` · `r2-guard-staging.cjs` · `r2-exec-pre-capture.cjs` · `r2-exec-verify.cjs` · `r2-exec-zero-touch.cjs` · `r2-exec-assemble-evidence.cjs` · `gen-deps.cjs` | herramienta forense re-ejecutable |

---

R1: REMEDIATED AND VERIFIED
R2: REMEDIATED AND VERIFIED
R2 REMEDIATION: EXECUTED
PRODUCTION CHANGES THIS PHASE: 9 SECDEF-READ GUARDS (3 MIGRATIONS, ZERO DATA MUTATIONS)
