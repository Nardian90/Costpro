# REM-INV-4 — 25-session-addendum.md

REM-INV-4 — FINAL REPORT · SESSION ADDENDUM
Baseline: 793d1309 (+ evidence-only commit 3add529c)
Scope: PostgreSQL schema/function drift — fresh re-verification & evidence-pack completion
Production business-data mutation: ZERO

---

## 1. Contexto de esta sesión

La sesión anterior ejecutó el gate completo (snapshot LIVE, reconstrucción Git de 427 migraciones,
comparación, replay R1/R2 en PostgreSQL 17.6 efímero, drift register F-01…F-13, verdicto) y cerró con
commit de evidencia `3add529c` sobre el baseline `793d1309`, pero quedó cortada **antes de entregar el
informe final** y dejó huecos frente al task order (§5: `11-live-indexes`, `12-live-sequences`,
`13-live-types`, `14-live-rls`, `15-live-extensions`; §31: matriz Q1–Q16 explícita).

Esta sesión (continuación) hace TRES cosas, sin tocar código ni producción:

1. **Reactiva el servidor** con PM2 + `.env` (petición explícita): `costpro` online, HTTP 200.
2. **Re-verifica en fresco** el evidence pack commiteado contra el PostgreSQL LIVE actual.
3. **Completa los huecos** del pack y entrega la matriz Q1–Q16.

## 2. Situación de baseline (GATE A — documentado)

```text
HEAD        = 3add529c489e7a8e4a9dd389c21c260d839a0891
origin/main = 3add529c489e7a8e4a9dd389c21c260d839a0891
WORKTREE    = CLEAN
793d1309    = padre directo de 3add529c
```

`git diff --name-only 793d1309..3add529c` → **exclusivamente** `audit-evidence/REM-INV-4/*`
(291 archivos, 147,840 inserciones). Es decir: **el árbol de código es byte-idéntico al baseline
exigido 793d1309**; el único delta es el commit de evidencia del propio gate. El snapshot original
(`00-baseline.txt`) fue capturado con HEAD == origin/main == 793d1309 y worktree limpio
(solo el directorio de evidencia sin trackear). GATE A: **OK, documentado**.

## 3. Re-verificación fresca del pack (14:18–14:40 UTC del 2026-09-13)

Método: Supabase Management API `/database/query` (PostgreSQL 17.6 LIVE) con guard client-side
read-only (allowlist SELECT/WITH + blocklist de keywords mutantes + bloqueo multi-statement).
Scripts: `scripts/r4-reverify.mjs`, `r4-artifacts.mjs`, `r4-grants-diff.mjs` (fuera del repo).

| # | Superficie | Resultado LIVE-hoy vs pack |
|---|---|---|
| A | **484 funciones** (md5(prosrc), prosecdef, proconfig, owner, proacl, prokind, provolatile) | **484/484 idénticas — 0 cambios, 0 altas, 0 bajas** |
| B | **82 triggers public** | **82/82 idénticos**; +6 triggers de plataformas no-public (auth.users ×1, realtime ×1, storage ×4) fuera del scope del pack — plataforma Supabase, no drift de aplicación |
| C | **391 policies** (roles, qual, with_check) | **391/391 semánticamente idénticas** (diffs iniciales eran artefactos de renderizado: `\n` escapado, llaves de array, separador `|`) |
| D | **146 tablas + 8 vistas** (flags RLS) | **154/154 idénticas**; +3 **matviews** (`mv_cash_session`, `mv_margin_product`, `mv_sales_daily`) que el `01b` original no inventarió — gap del pack, no drift |
| E | **Grants de tabla** | **4133/4133 filas del pack presentes en LIVE — removed = 0**. added = 682 explicados al 100%: 600 × `MAINTAIN` (privilegio PG17 que `information_schema.role_table_grants` no renderiza) + 82 de la vista `v_document_state_summary` (filtro relkind de la primera pasada) |
| F | **Fingerprint de negocio PRE** | **Idéntico al `zero-touch-pre.json` del pack EN TODAS las secciones** (devolutions 25/355120.00 · transactions 597 · payments 458/8249548.4999999999465733 · stock_movements 1021/13506.6289 · inventory 277 · audit_logs 8145 con max_created 2026-09-13 03:19:31 **idéntico**) — cero actividad de negocio entre el cierre del gate (05:44Z) y esta sesión (14:18Z) |
| G | **Grants EXECUTE de RPCs críticos** | `proacl` cubierto por (A): 484/484 idénticas → superficie EXECUTE sin cambios |

Spot-checks de seguridad (sin regresión):
- `audit_logs` anon/authenticated: arwdDxtm (+MAINTAIN) → **F-05 vigente** (sin remediación, como corresponde: este gate no repara).
- `devolutions`/`devolution_items` anon/authenticated: r×t (+MAINTAIN) → **REVOKE de REM-INV-3R-B intacto**.
- `stock_movements`: anon sin grants; authenticated SELECT-only → **patrón endurecido intacto**.
- `fn_validate_document_transition`: md5(prosrc) `469c529a…` — **exactamente la versión fail-closed que dejó REM-INV-3C**.

**Conclusión de re-verificación: el estado LIVE de hoy es indistinguible del estado certificado por
el pack. El veredicto emitido sigue siendo válido sin necesidad de re-ejecutar el gate completo.**
Evidencia: `22-reverification-catalog.json`, `23-session-reverification.json`,
`23-live-functions-addendum.tsv`.

## 4. Huecos completados (task order §5)

| Archivo task order | Estado | Cobertura |
|---|---|---|
| `10-live-tables.tsv` | cubierto por `01b-live-tables.tsv` (pack original) + matviews documentados aquí | 146 tablas + 8 vistas (+3 matviews) |
| `11-live-indexes.tsv` | **NUEVO en esta sesión** | índices public completos con indexdef |
| `12-live-sequences.tsv` | **NUEVO** | 6 secuencias + atributos + grants |
| `13-live-types.tsv` | **NUEVO** | tipos definidos por usuario + labels enum |
| `14-live-rls.tsv` | **NUEVO** | relrowsecurity/relforcerowsecurity + nº policies por tabla |
| `15-live-extensions.tsv` | **NUEVO** | extensiones instaladas + versión + schema |

## 5. Nueva observación de la sesión — F-14 (D3)

Durante el diff de grants apareció que el método de captura del pack (`role_table_grants`) no
renderiza el privilegio **MAINTAIN** (nuevo en PostgreSQL 17): LIVE tiene 600 grants MAINTAIN sobre
las 146 tablas (anon, authenticated, postgres, service_role). **No es un cambio posterior al pack**
— es un gap de captura. Explotabilidad: MAINTAIN permite VACUUM/ANALYZE/CLUSTER/REFRESH VIEW;
anon/authenticated no son roles login y PostgREST no expone MAINTAIN → mismo perfil que F-05
(insider/SQL-directo). **D3 — LOW**. Remediación R2: mismo gate de hardening que F-05
(REVOKE MAINTAIN a extremos) y añadir MAINTAIN al futuro `schema-drift-check`.

## 6. Matriz Q1–Q16 (§31 — respuestas explícitas, consolidadas pack + sesión)

| # | Pregunta | Respuesta |
|---|---|---|
| Q1 | ¿Funciones LIVE no reproducibles desde Git? | **157 de 309 de app (50.8%)** no reproducibles al estado final declarado (39 DRIFT_BODY + 25 DRIFT_SIGNATURE + 23 DRIFT_ATTRS + 55 ORPHAN_LIVE + 3 stale + 12 resto); además **13 declaradas en Git y ausentes en LIVE**. Reproducibles: 154 (49.8%), de las cuales 151 byte-exactas |
| Q2 | Drift de body | **39** (DRIFT_FUNCTION_BODY — cuerpo LIVE nunca declarado) |
| Q3 | Drift de signature | **25** (DRIFT_FUNCTION_SIGNATURE — firma y cuerpo) |
| Q4 | Drift SECURITY DEFINER/INVOKER | **2** (`audit_profile_changes`, `audit_store_access_changes` — prosecdef difiere con cuerpo reproducible) |
| Q5 | Drift de `search_path` | **21** funciones (proconfig difiere) |
| Q6 | Triggers que difieren | **32 de 87**: 24 ORPHAN_LIVE (20 app + 4 storage-plataforma) + 8 MISSING_LIVE (incl. triggers de auditoría declarados — F-08) · 63 MATCH |
| Q7 | RLS policies que difieren | **113 de 391**: 71 ORPHAN_LIVE (incl. deny-guards de inventory aplicados out-of-band) + 42 MISSING_LIVE (incl. 6 de audit_logs — F-08/F-05) · 320 MATCH |
| Q8 | Grants que difieren | **NON-RECONSTRUCTABLE textual** (mezcla default-privileges Supabase + GRANT/REVOKE out-of-band; F-01/F-02). Clasificación conductual: F-05 (audit_logs arwdDxtm a extremos — TRUNCATE incluido) + 7 tablas con patrón; **esta sesión añade F-14** (600 MAINTAIN no capturados por el view ISO — gap de método, D3) |
| Q9 | Objetos LIVE sin representación Git | Funciones **55 orphans** de app (+188 de extensiones, EXPECTED) · triggers **24** · policies **71** · tablas **53** (bootstrap core nunca versionado — F-01) |
| Q10 | Objetos Git ausentes en LIVE | Funciones **13** · triggers **8** · policies **42** · tablas **3** · migración completa **20260615000004 (fc_automation)** nunca aplicada — F-07 |
| Q11 | Casos security-sensitive | **3**: F-04 (3 fixes declarados no desplegados; el anti-spoofing de `has_store_role` tiene 6 callers), F-05 (TRUNCATE/DML extremos en audit_logs), F-08 (cobertura de auditoría menor a la declarada) |
| Q12 | ¿P0? | **NO** — ninguno demostrado (sin cross-store, sin RLS bypass, sin corrupción contable/inventario; zero-touch PRE==POST) |
| Q13 | ¿P1? | **P1 final NO**; **F-04 = P1 CANDIDATE** hasta reproducir en staging el spoofing (regla del gate: sin reproducción no se eleva) |
| Q14 | ¿3C aislado o sistémico? | **SISTÉMICO como proceso** (F-02: ledger congelado 2026-06-15; 97.2% del historial declarado sin registrar; F-03: ~mitad de la superficie funcional aplicada out-of-band). NO sistémico como bug replicado: los cuerpos LIVE divergentes son mayoritariamente versiones más nuevas |
| Q15 | ¿CostPro reproducible desde Git? | **NO, parcialmente**: funciones PARTIALLY (49.8% byte-exacto); esquema **NON-REPRODUCIBLE** (replay R2: 38.9% de migraciones aplican limpias, 17/146 tablas — el bootstrap de 53 tablas core nunca estuvo versionado); ledger NON-REPRODUCIBLE como proceso (12/427) |
| Q16 | ¿Evidencia suficiente para drift-detection automático? | **SÍ** — el motor de este gate (censo dollar-quote-aware + hashes dobles md5(prosrc)/sha256(canonical) + replay efímero de validación + canary) es reutilizable tal cual para un gate CI/CD `schema-drift-check`. Propuesto, NO implementado (§33/§34) |

## 7. Veredicto de sesión

El veredicto del gate **se re-afirma sin cambios**:

```text
CONDITIONAL — RECONCILIATION REQUIRED
```

Fundamento: (i) no hay determinismo de reconstrucción Git→producción (F-01/F-02); (ii) ~la mitad de
la lógica de aplicación no es reproducible desde el repo (F-03); (iii) fixes de seguridad declarados
no desplegados (F-04, candidato P1); (iv) sin P0 demostrado, sin corrupción, sin regresión de las
superficies endurecidas 3R-B/3C (re-verificado hoy) → no procede NOT READY ni CERTIFIED.

La re-verificación fresca de esta sesión confirma que **nada ha cambiado en LIVE desde la
certificación** (0 drift material en 484 funciones, 82 triggers, 391 policies, 154 tablas/vistas,
4133 grants, fingerprint de negocio idéntico), por lo que la evidencia del pack sigue vigente tal
cual. Cero-touch de la sesión: `24-session-zero-touch.json` (PRE == POST).

## 8. Puertas de remediación propuestas (§34 — sin ejecutar)

1. **REM-INV-4A (R3 seguridad)**: reproducir en staging el spoofing de `has_store_role`
   (LIVE vs fix 20260820000001); aplicar los 3 fixes de F-04 con pin de hashes si procede;
   REVOKE TRUNCATE/DELETE/MAINTAIN de extremos en audit_logs y familia (F-05+F-14).
2. **REM-INV-4B (R2 reconciliación)**: baselining del esquema (pg_dump --schema-only versionado),
   extracción de cuerpos LIVE a migraciones, decidir fc_automation (F-07) y residuos (F-11/F-13).
3. **Control permanente (§33, proponer — no implementar)**: `schema-drift-check` en CI/CD con los
   hashes canónicos de este gate, extendido a triggers/policies/grants/MAINTAIN.

## 9. Git closure de la sesión

Commit de evidencia exclusivo (addendum), push a origin/main, `bash scripts/gate-closure-check.sh`
→ CLOSURE OK esperado, PM2 online. Sin `.env`, sin credenciales, sin datos de producción en el pack
(secret scan de la sesión sobre archivos nuevos: limpio).
