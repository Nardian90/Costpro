# FASE F2 — 10 ESEC INTEGRITY

**Fecha**: 2026-09-27 · Mandato §13: NO reabrir E-SEC-FINAL; únicamente comprobar que el diff de producto es solo dependency/config y que D1–D5 continúan presentes.

## 1. Diff de código producto desde cad8e446

```text
$ git diff cad8e446 --stat -- src/ server.ts next.config.ts supabase/ e2e/
(salida vacía)
```

**0 cambios de producto entre el commit certificado de E-SEC-FINAL (cad8e446) y el working tree F2** (que incluye la remediación F1 + la remediación F2). La migración definitiva `supabase/migrations/20260927000001_esec_final_definitive_policy.sql`: `git diff cad8e446 -- <mig>` = vacío → **NO modificada**.

El diff total del working tree F2 vs b10919d6 se limita a: `package.json` (+1 línea override), `bun.lock` (2 versiones nanoid + metadato + cosmética bin) y esta carpeta de evidencia — **cero lógica de checkout, cero allowlists, cero migrations**.

## 2. Presencia estructural D1–D5 (mismo método y archivo que F0 y F1)

Conteos sobre `20260927000001_esec_final_definitive_policy.sql` — F2 vs F1 vs F0:

| Símbolo | Decisión | F2 | F1 | F0 | Coincidencia |
|---|---|---|---|---|---|
| `v_max_line_pct` | D1 gate por línea ≥15% | 9 | 9 | 9 | ✓ |
| `ERR_SUPERVISOR_TOKEN_REUSED` | D3 replay bloqueado | 3 | 3 | 3 | ✓ |
| `supervisor_token_usages` | D3 tabla single-use | 6 | 6 | 6 | ✓ |
| `catalog_price_at_sale` | D4 snapshot catálogo | 5 | 5 | 5 | ✓ |
| `price_at_sale` | D4 snapshot precio vendido | 14 | 14 | 14 | ✓ |
| `discount_reason` | D2 motivo obligatorio | 5 | 5 | 5 | ✓ |

Rutas intactas (sin diff): `create_sale_v2` (flag en `src/config/features.ts`), `/api/pos/checkout`, `supervisor-token.ts`, `sync/batch` → `create_sale_v2`.

## 3. Smoke subset E-SEC (mismo que F0/F1, dentro del Gate A)

```text
✓ src/__tests__/lib/supervisor-token.test.ts      (7 tests)  → D3 firma/scope/single-use
✓ src/__tests__/store/effective-unit-price.test.ts (15 tests) → D5 precio efectivo/redondeo
22/22 PASS (dentro de la suite 2278/0 de Gate A)
```

## 4. Verificación adicional de runtime (smoke F2)

- Landing HTTP 200 con el árbol reconstruido (nanoid 3.3.18 en build-deps).
- `GET /api/stores` sin autenticación → **401** (guard de autenticación intacto).

## Conclusión

```text
D1–D5 / create_sale_v2 / supervisor-token / snapshot / single-use → INTACTOS
diff de producto F2 = SOLAMENTE dependency/config (package.json + bun.lock)
F2 NO reabre ni re-certifica E-SEC-FINAL.
```
