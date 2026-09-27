# FASE F1 — 10 ESEC INTEGRITY

**Fecha**: 2026-09-27 · Mandato §12: verificar que F1 NO alteró E-SEC-FINAL; NO re-certificar; NO reabrir.

## 1. Diff de código producto desde cad8e446

```text
$ git diff cad8e446 --stat -- src/ server.ts next.config.ts supabase/ e2e/
(salida vacía)
```

**0 cambios de producto entre el commit certificado de E-SEC-FINAL (cad8e446) y el working tree F1** (que incluye los cambios de dependencias). La migración definitiva `supabase/migrations/20260927000001_esec_final_definitive_policy.sql`: `git diff cad8e446 -- <mig>` = vacío.

## 2. Presencia estructural D1–D5 (mismo método y archivo que F0)

Conteos sobre `20260927000001_esec_final_definitive_policy.sql` — F1 vs F0:

| Símbolo | Decisión | F1 | F0 | Coincidencia |
|---|---|---|---|---|
| `v_max_line_pct` | D1 gate por línea ≥15% | 9 | 9 | ✓ |
| `ERR_SUPERVISOR_TOKEN_REUSED` | D3 replay bloqueado | 3 | 3 | ✓ |
| `supervisor_token_usages` | D3 tabla single-use | 6 | 6 | ✓ |
| `catalog_price_at_sale` | D4 snapshot catálogo | 5 | 5 | ✓ |
| `price_at_sale` | D4 snapshot precio vendido | 14 | 14 | ✓ |
| `discount_reason` | D2 motivo obligatorio | 5 | 5 | ✓ |

Rutas intactas: `create_sale_v2` (flag en `src/config/features.ts`), `/api/pos/checkout` (D2 `discount_reason` ×2 en route.ts), `supervisor-token.ts` (comentarios D3 single-use líneas 29/120), `sync/batch` → `create_sale_v2` (F0 07-OFFLINE, sin cambios — src/ diff vacío).

## 3. Smoke subset (mismo que F0, dentro del Gate A)

```text
✓ src/__tests__/lib/supervisor-token.test.ts      (7 tests)  → D3 firma/scope/single-use
✓ src/__tests__/store/effective-unit-price.test.ts (15 tests) → D5 precio efectivo/redondeo
22/22 PASS (dentro de la suite 2278/0 de Gate A con vitest 4.1.11)
```

## 4. Verificación adicional de runtime (smoke F1)

- Landing HTTP 200 con el stack reconstruido sobre next 16.3.3.
- `GET /api/stores` sin autenticación → **401** (guard de autenticación intacto tras el bump de next).

## Conclusión

```text
D1–D5 / create_sale_v2 / supervisor-token / snapshot / single-use → INTACTOS
F1 NO produjo ningún cambio funcional. E-SEC-FINAL NO se reabre ni se re-certifica.
```
