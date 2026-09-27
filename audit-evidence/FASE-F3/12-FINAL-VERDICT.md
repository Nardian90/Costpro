# FASE F3 — 12 FINAL VERDICT (CONFIRMADO POST-CI)

**Fecha**: 2026-09-27 · Commit fix: `0d660541` · CI: runs `36296366950` (CI), `36296366922` (Test Coverage), `36296366966` (Security CI Gate) — todos `pull_request` sobre `0d660541` vía PR #1323.

## F3 — REMEDIACIÓN SEARCH_PATH_NOT_SET (CAPA B)

### Las 9 funciones y el cambio exacto (elementos 1 y 2)

| # | función | cambio exacto (1 línea por función) | criterio del valor |
|---|---|---|---|
| 1 | `cleanup_old_aggregates/1` | trailer: `… SECURITY DEFINER` → `… SECURITY DEFINER SET search_path = pg_catalog, public` | == ALTER aplicado en LIVE (20260902205210:165) == surface |
| 2 | `close_service_order_as_sale/6` | trailer: `… SET search_path TO 'public', 'extensions'` | == hermano certificado /7 (surface) |
| 3 | `fn_audit_stock_reception/0` | trailer: `… SET search_path = pg_catalog, public` | mínimo (refs 100% calificadas) |
| 4 | `fn_audit_transaction_voiding/0` | trailer: `… SET search_path = pg_catalog, public` | mínimo (refs 100% calificadas) |
| 5 | `purge_old_reset_snapshots/1` | header: línea nueva `SET search_path = pg_catalog, public` antes de `AS $$` | == ALTER (20260902205210:189) == surface |
| 6 | `receive_production_output/4` | trailer: `… SET search_path TO 'public', 'extensions'` | == hermano certificado /6 |
| 7 | `snapshot_commission_rule/0` | trailer: `… SET search_path = pg_catalog, public` | == ALTER (:192) == surface |
| 8 | `upsert_usage_aggregate/7` | trailer: `… SET search_path = pg_catalog, public` | == ALTER (:198) == surface |
| 9 | `withdraw_production_item/4` | trailer: `… SET search_path TO 'public', 'extensions'` | == familia certificada (withdraw /6) |

Total: **6 archivos de migraciones, +9/−8 líneas** — ningún otro cambio (06). Cuerpos/firmas/retornos/ACLs/RLS byte-idénticos (08, sha256). Sin migraciones nuevas; sin apply a BD alguna (11).

### Security Audit (elementos 3 y 4)

```text
Capa A — dependency audit:  SUCCESS (CI run 36296366950: "No vulnerabilities found"; bun audit local exit 0; npm audit = 0)
Capa B — security contract: las 9 violaciones objetivo = FIXED 9/9
                            CI: "Violaciones NUEVAS (bloqueantes): 0" (PRE: 9) · 0 entradas ▸ [Capa B]
                            el step mantiene exit 1 SOLO por 1 divergencia Capa C PREEXISTENTE
                            (create_sale_v2/21 BODY_DRIFT — no es una de las 9; idéntica en baseline
                            36285993203 / F1 36287866995 / F2 36292453246 / c09366ed 36294432757)
```

### Regresión (elemento 5)

| Gate | PRE-F3 | POST-F3 | Veredicto |
|---|---|---|---|
| Unit | 2278 pass / 0 fail / 24 skip | **2278 / 0 / 24** | 1:1, sin regresión |
| TypeCheck | 0 errors | **0 errors** | = |
| Lint | 0 errors / 1294 warnings | **0 errors / 1294 warnings** | = (mismo stock) |
| Build | CI authority (local OOM R-INFRA-1: exit 137, firma idéntica) | **CI Build SUCCESS** | sin regresión |
| Coverage | SUCCESS | **SUCCESS** (Unit & Integration SUCCESS) | = |
| bun audit | 0 | **0** | = |
| npm audit | 0 | **0** | = |

### E-SEC (elemento 6)

```text
E-SEC smoke subset: 22/22 PASS (supervisor-token 7 + effective-unit-price 15)
D1–D5 conteos: v_max_line_pct 9 · ERR_SUPERVISOR_TOKEN_REUSED 3 · supervisor_token_usages 6
               catalog_price_at_sale 5 · price_at_sale 14 · discount_reason 5  == F0/F1/F2
diff cad8e446 (src/server/next.config/e2e): vacío · migración 20260927000001: NO tocada
```

### CI (elemento 7)

| Gate | Resultado |
|---|---|
| Quality (TypeCheck/Lint/Unit/Build) | **SUCCESS** (run 36296366950) |
| Test Coverage | **SUCCESS** (run 36296366922; su E2E failure = estado F1/F2) |
| Security Audit — Audit dependencies | **SUCCESS** |
| Security Audit — Security contract | failure — solo Capa C preexistente (las 9 FIXED); condición documentada abajo |
| E2E (ci.yml) | cancelled a 30 min = baseline (R-E2E-1) |
| Security CI Gate (PR-only, preexistente v2.12.50) | failure PREEXISTING: 74 checks TS idénticos byte-a-byte al baseline (probado por `diff` de logs locales); Allowlist Review SUCCESS |

### Git y PR (elementos 8 y 9)

```text
Commit 1: 0d6605419b6b42af24a4a0339c32ea26201fc9db  fix(security): harden function search paths
Commit 2: <docs>                                     docs(audit): close F3 security contract
Rama:      audit/f3-search-path-remediation (push verificado: HEAD == origin/rama)
PR:        #1323 https://github.com/Nardian90/Costpro/pull/1323 (open, head 0d660541 → main; SIN merge)
Worktree:  limpio tras cada commit (git diff --check OK)
```

### Comparación con baseline (Sección 18)

| Gate | F1/F2 baseline | F3 | Resultado |
|---|---|---|---|
| bun audit | 0 | **0** | mantiene |
| npm audit | 0 | **0** | mantiene |
| Unit | 2278 pass | **2278 pass / 0 fail** | mantiene |
| TypeCheck | 0 | **0** | mantiene |
| Lint | 0 errors | **0 errors** | mantiene |
| Build CI | SUCCESS | **SUCCESS** | mantiene |
| Coverage | SUCCESS | **SUCCESS** | mantiene |
| Security Capa A | SUCCESS | **SUCCESS** | mantiene |
| Security Capa B | FAILURE × 9 (+1 Capa C) | **9 → 0 FIXED**; failure restante SOLO por Capa C preexistente | **mejora real y demostrada** |
| E-SEC smoke | 22/22 | **22/22** | mantiene |
| E-SEC D1–D5 | intact | **intact** | mantiene |
| Protected stores | zero-touch | **zero-touch** | mantiene |
| E2E | baseline state (cancelled / TC failure) | **idéntico** | mantiene |

La mejora de Capa B NO se declara «porque el número bajó»: se demuestra por (a) ausencia total de hallazgos de las 9 en el replay (local y CI), (b) prueba aislada 9/9 con cuerpos sha256 idénticos (08), (c) análisis de resolución objeto-por-objeto (04), (d) reconciliación surface intacta (Capa C sin divergencias nuevas).

## Veredicto

```text
F3 — CONDITIONAL
```

El objetivo técnico de F3 está **cumplido al 100%**: las 9 funciones `SEARCH_PATH_NOT_SET` están cerradas (9/9 FIXED, verificadas localmente y en el log de CI del propio commit `0d660541`: «Violaciones NUEVAS (bloqueantes): 0»), sin ninguna regresión atribuible (unit 1:1, tsc 0, lint 0, Build CI SUCCESS, Coverage SUCCESS, E-SEC 22/22, D1–D5 intactos, zero-touch, bun/npm audit 0) y con la disciplina de cambio mínimo probada (cuerpos byte-idénticos). El veredicto NO es CERTIFIED porque el criterio «Security Audit Capa B = SUCCESS» no se alcanza a nivel de job CI — por una condición externa claramente separada, no por las 9 — y NO es NOT READY porque ningún criterio de fallo del mandato se cumple:

```text
CONDICIÓN 1 — El step Security contract (Capa B) sigue en exit 1 por create_sale_v2/21 BODY_DRIFT (Capa C)
BLOCKER:     ninguno para F3 (no es una de las 9; las 9 están 9/9 FIXED en el mismo log)
EVIDENCE:    divergencia idéntica en baseline 36285993203, F1 36287866995, F2 36292453246,
             c09366ed 36294432757 y F3 36296366950. Causa raíz: contract-surface.sql exportado
             2026-09-15 (eeedc5b9) vs create_sale_v2 redefinida por 20260926000001_esec_price_integrity.sql
             (R-SEC-1, 2026-09-26) — snapshot desactualizado respecto a la migración E-SEC.
IMPACT:      el job Security Audit permanece rojo por esta única divergencia.
NEXT ACTION: fase propia del owner: re-export del surface con SUPABASE_ACCESS_TOKEN (re-certificación
             REM-INV-6 fuera de CI) O decisión de allowlist source_of_truth_baseline — prohibido
             dentro de F3 (§0 E-SEC-FINAL fuera de alcance; §22 producción READ ONLY).

CONDICIÓN 2 — Security CI Gate (workflow PR-only preexistente v2.12.50) en failure: 74 checks TypeScript
BLOCKER:     ninguno para F3 (F3 no tocó ningún .ts/.tsx; logs byte-idénticos entre baseline y F3)
EVIDENCE:    run 36296366966; repro local sobre baseline c09366ed y sobre árbol F3 → mismo output
             (scripts/f3-ts-checks-{baseline,post}.log, diff vacío). Nunca corrió en F0/F1/F2
             (pushes directos a main, sin PR).
IMPACT:      rojo adicional del PR, preexistente, no relacionado con la remediación SQL.
NEXT ACTION: fase propia de remediación TypeScript (Zod/auth middleware en rutas API) o revisión
             del scope del workflow — decisión del owner, fuera de F3.

CONDICIÓN 3 — R-E2E-1 (deuda preexistente, igual al baseline)
BLOCKER:     ninguno para F3
EVIDENCE:    E2E ci.yml cancelled a 30 min; Test Coverage E2E failure — idéntico a F1/F2/baseline
IMPACT:      nulo sobre F3
NEXT ACTION: fase E2E priorizada por F0 (secrets/fixtures/test.supabase.co)
```

No se corrigieron la divergencia Capa C, la deuda TypeScript del Security CI Gate, R-E2E-1, R-UX-DATE ni R-A11Y-1 (mandato: NO IMPLEMENTAR, documentar como deuda/next phase). La siguiente fase se decidirá leyendo este resultado real.
