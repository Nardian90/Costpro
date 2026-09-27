# FASE F0 — 08 ESEC INTEGRITY (Impacto sobre E-SEC-FINAL)

**Fecha**: 2026-09-27 · **Método**: smoke check estructural (mandato: NO repetir la certificación completa).

## 1. Integridad Git

```text
$ git diff cad8e446 892bcd6b -- src/ supabase/ package.json package-lock.json bun.lock e2e/
(salida vacía)
```

Entre el commit de E-SEC-FINAL (`cad8e446`) y el HEAD actual (`892bcd6b`) **no hay ningún cambio de código producto**: el único commit intermedio es docs-only (2 archivos de evidencia, ver 01-BASELINE.md). → **Drift funcional: 0.**

## 2. Presencia estructural de los mecanismos D1–D5

Símbolos clave en la migración definitiva `20260927000001_esec_final_definitive_policy.sql`:

```text
v_max_line_pct              9 coincidencias   (D1 — gate por línea ≥15%)
ERR_SUPERVISOR_TOKEN_REUSED 3 coincidencias   (D3 — replay bloqueado)
supervisor_token_usages     6 coincidencias   (D3 — tabla single-use)
catalog_price_at_sale       5 coincidencias   (D4 — snapshot catálogo)
price_at_sale              14 coincidencias   (D4 — snapshot precio vendido)
discount_reason             5 coincidencias   (D2 — motivo obligatorio)
```

Firmas y rutas intactas: `create_sale_v2` (24 params con defaults NULL — 20260927000001 líneas 73/146-147 valida `p_operation_date`), `/api/pos/checkout` pasa `p_operation_date`/token/reason (route líneas 86/198), `sync/batch` ruta a `create_sale_v2` (route línea 152) — ver 07-OFFLINE.

## 3. Smoke test unitario de la política (HEAD)

```text
$ npx vitest run src/__tests__/lib/supervisor-token.test.ts src/__tests__/store/effective-unit-price.test.ts
 ✓ src/__tests__/lib/supervisor-token.test.ts   (7 tests)   → D3 firma/scope/single-use
 ✓ src/__tests__/store/effective-unit-price.test.ts (15 tests) → D5 precio efectivo/redondeo
 Test Files  2 passed (2) · Tests  22 passed (22)
```

## 4. Referencia de la certificación previa (no re-ejecutada)

- `audit-evidence/FASE-E-SEC-FINAL/12-FINAL-VERDICT.md`: **CERTIFIED** — matriz 35/35, browser real (B1/B2/B3 + bypass 403 + replay T1/T2), vitest 2278/0, tsc 0, CI SUCCESS.
- Baseline unitario vigente: 2278 passed / 0 failed (los 24 skipped preexistentes).
- F0 ejecutó solo: diff estructural + greps de símbolos + 22 tests de humo. **Ningún cambio funcional, ningún toque a migraciones, flags ni a las tiendas protegidas.**

## Conclusión

```text
create_sale_v2 / supervisor-token / snapshot / single-use / D1–D5 → INTACTOS en HEAD (= certificados)
F0 no produjo ningún cambio funcional.
```
