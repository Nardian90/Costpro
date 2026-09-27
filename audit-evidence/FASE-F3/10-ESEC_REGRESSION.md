# FASE F3 — 10 ESEC REGRESSION (Sección 15: E-SEC smoke 22/22 + D1–D5 intactos)

**Fecha**: 2026-09-27 · Mandato: E-SEC-FINAL NO se re-certifica; se verifica que permanece intacto.

## 1. Smoke subset E-SEC (mismo que F0/F1/F2)

```text
$ CI=true bunx vitest run src/__tests__/lib/supervisor-token.test.ts src/__tests__/store/effective-unit-price.test.ts
exit=0
 Test Files  2 passed (2)
      Tests  22 passed (22)
✓ src/__tests__/lib/supervisor-token.test.ts       (7 tests)  → D3 firma/scope/single-use
✓ src/__tests__/store/effective-unit-price.test.ts (15 tests) → D5 precio efectivo/redondeo
22/22 PASS
```

## 2. Presencia estructural D1–D5 (mismo método y archivo que F0/F1/F2)

Conteos sobre `supabase/migrations/20260927000001_esec_final_definitive_policy.sql`:

| Símbolo | Decisión | F3 | F2 | F1 | F0 | Coincidencia |
|---|---|---|---|---|---|---|
| `v_max_line_pct` | D1 gate por línea ≥15% | 9 | 9 | 9 | 9 | ✓ |
| `ERR_SUPERVISOR_TOKEN_REUSED` | D3 replay bloqueado | 3 | 3 | 3 | 3 | ✓ |
| `supervisor_token_usages` | D3 tabla single-use | 6 | 6 | 6 | 6 | ✓ |
| `catalog_price_at_sale` | D4 snapshot catálogo | 5 | 5 | 5 | 5 | ✓ |
| `price_at_sale` | D4 snapshot precio vendido | 14 | 14 | 14 | 14 | ✓ |
| `discount_reason` | D2 motivo obligatorio | 5 | 5 | 5 | 5 | ✓ |

La migración E-SEC-FINAL **no aparece en el diff F3** (`git diff cad8e446 -- supabase/` = solo los 6 archivos de las 9 funciones; `20260927000001` ausente).

## 3. Diff de producto desde cad8e446 (commit certificado E-SEC-FINAL)

```text
$ git diff cad8e446 --stat -- src/ server.ts next.config.ts e2e/
(vacío)                                  → 0 cambios de producto
$ git diff cad8e446 --stat -- supabase/
 6 archivos: SOLO las migraciones de las 9 funciones (+9/-8 líneas, atributo search_path)
```

Rutas intactas (sin diff): `create_sale_v2` (flag en `src/config/features.ts`), `/api/pos/checkout`, `supervisor-token.ts`, `sync/batch`.

## Conclusión

```text
E-SEC smoke        22/22 PASS
D1–D5              INTACTOS (conteos exactos F0/F1/F2)
create_sale_v2 / checkout / supervisor-token / snapshot / single-use  INTACTOS
F3 NO reabre ni re-certifica E-SEC-FINAL
```
