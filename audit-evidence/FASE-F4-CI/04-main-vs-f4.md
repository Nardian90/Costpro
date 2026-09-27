# FASE F4-CI — 04 MAIN vs F4 (comparación baseline)

## SHAs comparados

- **BASELINE_MAIN_SHA**: `9327ee33b8582adedc22bfda4440c7e75c9fb2bb`
- **F4_SHA (fix)**: rama `audit/f4-create-sale-v2-reconciliation` desde `9327ee33` + fix (ver 06-fix.md para el SHA final)

## Tabla de checks (comando idéntico en ambos lados)

| Check | Comando | MAIN (9327ee33) | F4 (fix) | Nota |
|---|---|---|---|---|
| Security Audit (static contract) | `node scripts/security-contract-test-static.cjs` | **FAIL** (exit 1, BODY_DRIFT /21) | **PASS** (exit 0, 0 divergencias) | El job exacto que fallaba — ver 05 y 07 |
| Security Audit (LIVE contract) | `node scripts/security-contract-test.cjs` | no ejecutable contra snapshot stale | **PASS** (141/141, 0 violaciones, pin REM-INV-2R OK) | Ver 07 |
| BOLA contract | `node scripts/bola-contract-test.cjs` | PASS (en CI) | **PASS** (5/5) | |
| TypeCheck | `bunx tsc --noEmit` | PASS (CI quality success) | **PASS** (exit 0) | |
| Lint | `bun run lint` | PASS (CI quality success) | **PASS** (0 errors; 1294 warnings = deuda histórica idéntica) | |
| Unit | `bun run test` | PASS (CI quality success) | **PASS** (109 files, 2269 tests, 33 skipped) | 216s |
| Build | `NODE_OPTIONS=--max-old-space-size=4096 CI=true bun run build` | PASS (en CI) | **compile OK (70s) + TypeScript-phase SIGKILL local (OOM host)** | Precedente documentado: commit `bbb74f4c` ("local build OOM was host-only"). `tsc --noEmit` standalone PASS. CI runner (7GB) valida. El cambio F4 no toca un solo archivo TS. |
| E2E | `bun run test:e2e` | FAIL en CI (secrets ausentes, categoría D) | Sin cambios — misma limitación CI. Local: E2E-POS-001 **PASS**; E2E-POS-009 FAIL por fixture (product=N/A, drift de datos de tienda piloto, no F4) | Ver 07 |

## Diff del cambio F4 (scope exacto)

```text
supabase/migrations/20260927000002_f4_create_sale_v2_acl_reconciliation.sql  (nuevo, 54 líneas, solo GRANT/REVOKE)
supabase/security-contract/contract-surface.sql                              (regenerado canónicamente)
audit-evidence/FASE-F4-CI/                                                   (evidencia, docs)
```

El snapshot regenerado presenta exactamente UN cambio funcional de contenido (verificado por comparación de conjuntos de entradas): `create_sale_v2` `/21` (cuerpo pre-E-SEC) → `/24` (cuerpo E-SEC-FINAL verbatim desde LIVE). 141→141 funciones; 0 cambios en las otras 140 entradas (el reordenamiento posicional de los dos overloads de `fn_process_receipt` es cosmético, contenido idéntico).

## ¿El mismo check falla en main?

**SÍ** — Security Audit falla en `main@9d220a36` y en `main@9327ee33` con el mismo error. La causa raíz (snapshot stale + fantasma /21 en replay) existe en ambos SHAs. La corrección pertenece al alcance F4 (la reconciliación que la fase debía entregar) y por eso se aplica en esta rama; NO se modifica main directamente (§21).
