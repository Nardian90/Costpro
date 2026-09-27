# FASE F3 — 01 BASELINE

**Fecha**: 2026-09-27 · **Fase**: F3 — Remediación controlada SEARCH_PATH_NOT_SET (Security Audit Capa B) · **Mandato**: cerrar exclusivamente las 9 funciones `[LOW] SEARCH_PATH_NOT_SET`; no tocar E-SEC-FINAL, R-E2E-1, R-UX-DATE, R-A11Y-1, R-INFRA-1, nanoid (F2) ni R-DEPS-1 (F1); cero cambios funcionales.

## Estado Git verificado antes de tocar cualquier archivo

```text
$ git fetch origin                      → OK
$ git status --short                    → (vacío)
$ git rev-parse HEAD                    → c09366edaa45a201f3e505c07d3fb34708f881eb
$ git rev-parse origin/main             → c09366edaa45a201f3e505c07d3fb34708f881eb
$ git diff --check                      → OK (sin errores)
$ git log -5 --oneline
c09366ed docs(audit): FASE F2 — CI verificado sobre 53e3d655 … VEREDICTO FINAL: F2 — CONDITIONAL
53e3d655 fix(ci): pin bun 1.3.14 — bun 1.4.x rechaza lock v1 con override range-scoped nueva
041d5c3e security(deps): close nanoid advisory
b10919d6 docs(audit): FASE F1 — CI verificado sobre 9423aa1d … VEREDICTO FINAL: F1 — CONDITIONAL
9423aa1d security(deps): remediate F1 dependency advisories
```

**HEAD == origin/main == c09366ed** (baseline declarado por el mandato) → sin discrepancias, sin reset, sin force-push. Worktree limpio. Sin commits posteriores que analizar.

## Entorno

| Componente | Versión | Mandato exige |
|---|---|---|
| Node (local) | **v24.21.0** | v24.21.0 ✓ |
| Bun (local) | **1.3.14** | 1.3.14 ✓ (no se actualizó durante F3) |
| Bun (CI) | **1.3.14** (pin de F2, `oven-sh/setup-bun@v2`) | fijado 1.3.14 ✓ |
| npm | 11.19.0 | — |
| Rama de trabajo | `audit/f3-search-path-remediation` creada desde c09366ed (§3) | nunca sobre main ✓ |

## Punto de partida heredado de F2 (verificado, no asumido)

Lectura completa de `audit-evidence/FASE-F2/01…12` (12/12 archivos) + re-verificación con comandos propios:

- F2 veredicto **CONDITIONAL**: objetivo nanoid 100% cumplido; condiciones documentadas (deuda SQL Capa B, pin bun, R-E2E-1).
- `bun audit` = **0** y `npm audit` = **0** (POST-F2, run CI 36292453246 step "Audit dependencies" SUCCESS).
- Bun **1.3.14 fijado en CI** (5 pasos setup-bun en ci.yml y test-coverage.yml).
- E-SEC-FINAL intacto (diff `cad8e446` vacío en src/server/next.config/e2e; conteos D1–D5 = F0/F1).
- Las 9 funciones `SEARCH_PATH_NOT_SET` = exactamente el conjunto del baseline (F2 12-FINAL-VERDICT líneas 55–59): `cleanup_old_aggregates/1, close_service_order_as_sale/6, fn_audit_stock_reception/0, fn_audit_transaction_voiding/0, purge_old_reset_snapshots/1, receive_production_output/4, snapshot_commission_rule/0, upsert_usage_aggregate/7, withdraw_production_item/4`.

## Precisión sobre el bloqueo real del job (descubierta y documentada en F3)

Reproduciendo el detector (02-PRE_SECURITY_AUDIT.md) se documenta que el step `Security contract (static, CI-safe)` sale `exit 1` por **1 violación bloqueante Capa C** (`create_sale_v2/21 BODY_DRIFT_FROM_MIGRATION`, CRITICAL) — presente e idéntica en los logs de CI del baseline (36285993203), F1 (36287866995), F2 (36292453246) y en el run del commit docs de F2 c09366ed (36294432757). Las 9 `[LOW] SEARCH_PATH_NOT_SET` del objetivo F3 se imprimen como violaciones **no bloqueantes** (severidad LOW). El mandato F3 acota el objetivo a las 9 funciones; la divergencia Capa C se clasifica PREEXISTING — OUT OF SCOPE (07/12).
