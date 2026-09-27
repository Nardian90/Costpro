# FASE F0 — 10 FINAL VERDICT

**Fecha**: 2026-09-27 · **Baseline efectiva**: `892bcd6b` (== origin/main, worktree limpio; código producto = `cad8e446`, sin drift)

## Veredicto

```text
F0 — RECONCILIATION COMPLETE
```

F0 es una fase de clasificación: **no se certificó nada nuevo y no se arregló nada** (mandato). Se eliminó la incertidumbre sobre los 5 riesgos heredados con evidencia reproducible. No procede la etiqueta CERTIFIED para esta fase.

## Clasificación final de cada riesgo

| Riesgo | Veredicto F0 |
|---|---|
| R-DEPS-1 | **CONFIRMED OPEN · PREEXISTING · READY FOR REMEDIATION** — 7 vulns actuales (2 advisories critical RCE en next 16.3.0, 1 no aplicable a la topología), todas con fix patch no-breaking |
| R-E2E-1 | **PREEXISTING · TOOLING/ENVIRONMENTAL** — 3 causas raíz de infraestructura (secrets CI, fixture auth obsoleto, URL Supabase ficticia) explican los 156–171 fallos; **0 bugs de producto, 0 regresión** de E-SEC/E-SEC-FINAL |
| R-UX-DATE | **CONFIRMED OPEN · READY FOR REMEDIATION** — repro determinista en ventana crítica; causa: divergencia de política cliente (forward-only obsoleto) vs server (business-date Havana −6m/+1d) + parsing medianoche UTC; workaround existente |
| R-A11Y-1 | **CONFIRMED OPEN (menor)** — 4.19:1 en el único combo texto-warning/sobre-warning/10 (AA FAIL texto normal, AA PASS texto grande); dark PASS; tokens muertos sin uso |
| Offline sync | **NO BUG · DOCUMENTATION ONLY** — flujo ACTIVO con contrato self-session RC-1 idempotente, compatible con D1–D5, fail-closed sin bypass |

## E-SEC-FINAL: frontera estable preservada

```text
git diff cad8e446..HEAD (código producto) = vacío
Símbolos D1–D5 presentes en migración definitiva
Smoke: 22/22 tests (supervisor-token 7, effective-unit-price 15) PASS
Tiendas protegidas: 0 mutaciones en toda F0 (solo lecturas GET/login y fixtures aislados)
```

---

## NEXT PHASE:

```text
FASE F1 — REMEDIACIÓN DE DEPENDENCIAS DE SEGURIDAD (R-DEPS-1)

Scope:
- Bump patch no-breaking en package.json + lockfiles: next 16.3.0→16.3.3 (cierra GHSA-p293-qw3h-jr36 y
  GHSA-2xp9-vwfh-vxw4), sharp 0.35.3→0.35.4, js-yaml 4.3.1→4.3.2, csv-parse 7.0.1→7.0.2, vitest 4.1.10→4.1.11.
- Verificación completa: vitest (2278+), tsc --noEmit, eslint, build/CI, smoke de imagen (sharp) y smoke de
  checkout POS en browser real.
- Evidencia en audit-evidence/FASE-F1/ con metodología de fases previas (baseline/matriz/CI/zero-touch).

Why:
- Único ítem P1: elimina las 2 advisories critical (RCE) del runtime de producción con esfuerzo mínimo
  y riesgo bajo (todas las fixes son patch).
- Cierra el gate rojo de Security Audit que arrastra CI desde E-SEC → todos los runs futuros (F2/F3)
  se interpretan con CI completamente verde.
- Se tocan lockfiles UNA vez; las fases siguientes no necesitan volver a tocarlos.

Out of scope:
- R-E2E-1 (será F2), R-UX-DATE (F3), R-A11Y-1 (higiene posterior), cambios de código producto,
  upgrades mayores de versiones, cualquier apertura de C2R/E-SEC/E-SEC-FINAL.

Acceptance criteria:
- npm audit: 0 critical / 0 high (idealmente 0 total).
- CI del commit: TypeCheck+Lint+Unit+Build SUCCESS y Security Audit SUCCESS.
- vitest/tsc/eslint sin regresiones (clasificación four-bucket: 0 FAIL REGRESSION).
- Smoke browser: venta normal 500→500 y legítima 500→490 siguen operando sin supervisor.
- Tiendas protegidas byte-idénticas (zero-touch) · push verificado · HEAD == origin/main.
```
