# 05 — DB BEFORE (estado vivo pre-migration)

**Raws:** `evidence/remf403-db-functions-census.txt` (censo de funciones),
`evidence/remf403-v3-definition-pre-grant.json` (definición viva completa de `_v3`),
`evidence/remf403-zero-touch-PRE.txt` §Z5 (ACL PRE capturado antes del apply).

## Estado PRE del ACL de `_v3` (capturado ANTES del apply — zero-touch PRE §Z5)

```json
{"proname":"withdraw_production_item_v3","acl":"postgres=X/postgres,service_role=X/postgres"}
```

→ `authenticated` SIN EXECUTE (huérfana), `anon` SIN EXECUTE, `PUBLIC` SIN EXECUTE.

## Definición viva de `_v3` (pre-grant, íntegra)

`CREATE OR REPLACE FUNCTION public.withdraw_production_item_v3(
  p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_reference_id uuid DEFAULT NULL,
  p_reference_doc text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'`

Puntos clave del cuerpo (verificación directa de la directiva §7/§8):

1. **No acepta `p_unit_cost`.** No existe parámetro de costo en la firma.
2. **Costo SIEMPRE server-side** (comentario DF-05 en el cuerpo):
   `SELECT cost_average INTO v_real_unit_cost FROM products WHERE id=v_product_id AND store_id=v_order_store_id FOR UPDATE;`
   — sin fallback a 0: NULL → `ERR_PRODUCT_COST_UNAVAILABLE`.
3. **WAC=0 exige aprobación documentada**: `w62_zero_cost_flags` scope
   `approve_zero_cost_material`; sin flag → `ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED`.
4. **Locks**: `FOR UPDATE` en `production_order_items`, `production_orders`,
   `products` (transacción única del RPC).
5. **Isolation**: `has_store_access_as(v_caller_uid, v_order_store_id)` con
   caller derivado de JWT (`auth.uid()`; `p_user_id` solo para service_role).
6. **Estado de orden**: solo `in_progress`/`approved`.
7. **Overconsumption**: `v_actual + p_qty > v_budgeted → ERR_OVERCONSUMPTION`.
8. **Ledger**: UPDATE de item (`actual_qty += p_qty`, `actual_unit_cost = v_real_unit_cost`,
   `withdrawed_at`, `status` completed/partial) + `register_stock_movement`
   (production_out, `p_unit_cost := v_real_unit_cost`, `p_skip_access_check := TRUE`).
9. **Idempotencia**: `check_idempotency(key, 'withdraw_v3', item, hash)` al inicio;
   `register_idempotency(...)` al final.
10. **Auditoría**: `audit_logs` `PRODUCTION_ITEM_WITHDRAWN` con
    `cost_authority='server_side_wac_v3'` y `unit_cost_used`.

## Respuesta a la pregunta crítica (directiva §7)

> ¿De dónde obtiene actualmente el costo unitario `_v3`?

**De `products.cost_average` (WAC) server-side, bajo `FOR UPDATE`, sin
fallback a 0 y con WAC=0 denegado salvo aprobación documentada. NO usa
ningún costo provisto por el cliente (no tiene parámetro para ello).**

## Otros objetos PRE

- `withdraw_production_item` (nombre de la ruta): AUSENTE (census).
- `production_order_withdrawals`: AUSENTE (referencia histórica sin aplicar;
  el registro real de retiros es `audit_logs` + `production_order_items`).
- REM-F4-04 intacto: `fn_recalc_wac` + `register_reception` presentes (census).
