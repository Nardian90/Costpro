# 05 — CODE DIFF SUMMARY

## Alcance total del cambio en el repo

### 1. Migración (nueva, única pieza de producción)

```
supabase/migrations/20260909000000_rem_f4_04_register_reception_canonical_wac.sql
```

- `CREATE OR REPLACE FUNCTION public.register_reception(...)` — misma firma de
  7 argumentos, mismos defaults, mismo `SECURITY DEFINER`, mismo `search_path`.
- Cambio de cuerpo: ver `evidence/remf404-fn-before-after.diff` (32 líneas).
- Rollback preservado: `evidence/rollback_register_reception.sql`.

### 2. Tests F4-04 (nuevo, solo evidencia de auditoría)

```
audit-evidence/20260908-rem-f4-04/tests/f4_04_tests.mjs   (20.7 KB, suite P0–P9)
```

Suite ejecutable independiente (Node + fetch + service harness documentado)
que reproduce el defecto por el camino HTTP real y verifica el oráculo
matemático exacto. NO modifica tests existentes del repo (no se debilitó nada).

### 3. Evidence pack (este directorio)

17 documentos numerados (00–16) + raws + SHA256SUMS.

## Lo que NO cambió (verificación negativa)

| Área | Estado |
|---|---|
| `git diff` en tracked files antes del commit | vacío — cero modificaciones en código de aplicación |
| `src/app/api/production-orders/[id]/withdraw/route.ts` (F4-03) | INTACTO |
| `src/app/api/commissions/payments/route.ts` (F4-06) | INTACTO |
| Trigger `trg_update_product_wac` | NO recreado (ausente por diseño) |
| `confirm_pending_reception` | Sin cambios (§B1 comparación viva) |
| `register_stock_movement` | Sin cambios |
| `fn_recalc_wac` | Sin cambios (sigue siendo el único escritor) |
| ACL/grants de `register_reception` | Sin cambios (§B4) |
| next.config.ts / package.json / dependencias | Sin cambios |

## Principio arquitectónico respetado

**Un solo escritor matemático.** El frontend/API/JS sigue sin calcular WAC;
el cliente solo envía `quantity / unit_cost / currency / exchange_rate`.
La única fórmula vive en `fn_recalc_wac`, y la recepción ahora la invoca.
