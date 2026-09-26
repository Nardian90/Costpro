# FASE E-SEC-FINAL — 10 REGRESSION (FASE 6 del mandato)

**Fecha**: 2026-09-26 · **Clasificación**: PASS / FAIL REGRESSION / FAIL PREEXISTING / FAIL INFRA / NO EJECUTADO

## vitest

```text
Test Files  110 passed | 1 skipped (111)
     Tests  2278 passed | 24 skipped (2302)
```
- **0 FAILED** → cero regresiones. Referencia E-SEC: 2254 passed/0 failed → ahora 2278 (+24 tests nuevos de E-SEC-FINAL: round2/D5, supervisor-token D3, route D1–D5). Los 24 skipped son preexistentes (backup-schema-validation, entorno-dependientes).
- Suite final ejecutada dos veces (tras la migración y tras los 2 fixes de browser) con el mismo resultado 2278/0.

## tsc (TypeScript)

```text
$ NODE_OPTIONS="--max-old-space-size=3584" npx tsc --noEmit
EXIT 0  (0 errores)
```
(Nota: durante el desarrollo se detectó 1 error de TIPO en un mock de test — corregido antes del cierre; el chequeo final es limpio.)

## eslint

```text
Archivos tocados por E-SEC-FINAL (13): 0 errors, warnings preexistentes de estilo
(total repo: ~1294 warnings preexistentes documentados desde E-SEC-R)
EXIT 0
```

## build / CI

- **Build local: NO EJECUTADO** → FAIL INFRA (preexistente): OOM del host documentado desde FASE B/C (R-INFRA-1); E-SEC registró idéntica limitación. Mitigación: TypeCheck+Build se verifican en CI tras el push (ver 12-FINAL-VERDICT y el chequeo CI del commit).
- CI: se verifica tras FASE 11 (push) con la misma metodología de fases previas (GitHub API read-only). E2E es suite preexistente tolerada (R-E2E-1, fuera de alcance por mandato).

## Clasificación de resultados

| Check | Estado |
|---|---|
| vitest 2278/0 | **PASS** |
| tsc --noEmit | **PASS** |
| eslint (tocados) | **PASS** (0 errors) |
| build local | **FAIL INFRA** (preexistente R-INFRA-1, mitigado por CI) |
| CI post-push | verificado tras FASE 11 |
| FAIL REGRESSION | **NINGUNO** |
