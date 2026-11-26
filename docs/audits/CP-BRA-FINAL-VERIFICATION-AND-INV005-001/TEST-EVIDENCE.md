# TEST-EVIDENCE — Pruebas y regresión (FASE 9)

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Clasificación de fallos usada:** defecto real / fallo de infraestructura / timeout / configuración / limitación documentada / resultado inconcluso. **Un resultado inconcluso NO se cuenta como PASS.**

## 1. CI oficial (autoritativa) — 4 heads de la cadena, todos `success`

| Check | #1717 `90ce9e5d6` | #1718 `9b6bb8dc3` | #1719 `abd32444d` | #1720 `37f20697e` |
|---|---|---|---|---|
| TypeCheck + Lint + Unit Tests + Build | ✅ | ✅ | ✅ | ✅ |
| TypeScript Security Checks | ✅ | ✅ | ✅ | ✅ |
| SQL DB Security Checks | ✅ | ✅ | ✅ | ✅ |
| SQL Static Checks | ✅ | ✅ | ✅ | ✅ |
| Security Audit | ✅ | ✅ | ✅ | ✅ |
| Allowlist Review | ✅ | ✅ | ✅ | ✅ |
| **E2E Aislado (project)** (workflow manual) | ✅ | ✅ | ✅ | ✅ |
| Unit & Integration Tests | ✅ | ✅ | ✅ | ✅ |
| Vercel Preview Comments | ✅ | ✅ | ✅ | ✅ |

E2E aislado contra `CostproE2E` (lguovmvrozxgssupkwpf) exclusivamente; producción prohibida (guard CP-INFRA-019 + sentinel e2e_is_isolated_db). El head `37f20697e` es byte-idéntico al contenido hoy en main tras fusionar los 4 PRs → la evidencia CI aplica a main `33ec0975c`.

## 2. Pruebas locales ejecutadas en esta misión (main fusionado)

| Suite | Resultado | Clasificación |
|---|---|---|
| `bunx vitest run src/__tests__/migrations/` (56 archivos) | **692/692 PASS** (42 s) | PASS |
| `accounts-receivable-rates.test.ts` + payment-engine contract | **22/22 PASS** | PASS |
| `useSuppliers-proveedores-001.test.tsx` | incluido en los 724 | PASS |
| Total local subset: 59 archivos | **724/724 PASS** | PASS |
| `security-contract-test-static.cjs` | **CONTRATO OK, 0 divergencias**, 3 warnings MEDIUM/LOW preexistentes (semántica idéntica) | PASS |
| ESLint en los 5 archivos modificados clave | **0 errores**, 9 warnings preexistentes (no bloqueantes) | PASS |
| `bunx tsc --noEmit` local | **NO EJECUTABLE** — JS heap OOM (límite 2 GB del sandbox) | **limitación documentada** (preexistente; CI TypeCheck = evidence autoritativa) |
| Suite Vitest completa local (>10 min) | timeout del sandbox a los 600 s | **timeout de entorno** — la cobertura equivalente queda demostrada por CI (Unit & Integration + TypeCheck + Build green) |
| E2E local con swap de entorno | NO ejecutado en esta misión | **no requerido** — CI E2E Aislado green en el SHA exacto; el build de producción y guardrail son responsabilidad del workflow oficial |
| Guardrail higiene `net delta = 0` | evidencia de la remediación (×2 PASS, expediente CP-BRA-REMEDIATION) + CI sin residuos reportados | PASS (evidencia remediación + CI) |

## 3. Verificaciones read-only contra producción (solo lectura)

| Verificación | Resultado |
|---|---|
| Sonda DDL `cpbra-verify-prod-migrations.mjs` (27 checks) | **27/27 PASS** |
| Marcas versionadas `cpbra-apply-migration-prod.mjs --check` | 9/9 + 5/5 + 5/5 → «YA APLICADA», exit 0 |
| Forense 7 críticos (2 ejecuciones: pre y post fusión) | mismos conteos; sin regresiones (R-01 18/18 · R-04 0 · R-05 1 ajuste · R-11 3 ventas explicadas · R-14 0 · R-15 0) |
| Análisis de las 3 ventas con incidencias | explicables, trazables, compatibles con reglas nuevas (sin modificarlas) |
| Análisis R-05 (RPC + historial + distribución) | n=1; gap de autorización caracterizado (DECISION-R05.md) |
| Excepciones históricas | 3 recepciones «—» = $19.435 exacto; inventario trazable; 0 pagos/fin_movements |

## 4. Resumen

- **Sin defectos reales nuevos** introducidos por las remediaciones (forense idéntico pre/post fusión; 724 tests locales PASS; CI 9/9 × 4).
- **Sin regresiones detectadas** en los dominios tocados (motor de pagos, CxC, POS, proveedores).
- Evidencia autoritativa de TypeCheck/Build/E2E: **CI** (9/9 × 4 heads). Las limitaciones locales (heap OOM de tsc, timeout de suite completa) quedan clasificadas y NO invalidan la evidencia CI; tampoco se cuentan como PASS locales.
