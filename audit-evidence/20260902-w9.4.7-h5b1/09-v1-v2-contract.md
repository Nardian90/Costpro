# W9.4.7 — H5-B1 · FASE 9 — Contrato V2 vs V1

Fecha: 2026-09-03 · Fuentes: `pg_get_functiondef(136653)` y `pg_get_functiondef(138188)` (producción, capturados en `01-live-v1-catalog.json` y `v2_def.sql`), `supabase/migrations/20260810000040_pr4_kardex_fix.sql` (PR-4.3).

## Firma (idéntica caller-side)

```
reverse_transaction    (p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL) → jsonb
reverse_transaction_v2 (p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL) → jsonb
```

## Comparación 12 dimensiones

| Dimensión | V1 (V2.12.12, live) | V2 (PR-4.3, live) | Veredicto |
|---|---|---|---|
| Firma/return | uuid,text,uuid→jsonb | idéntica | igual |
| SECURITY DEFINER + owner | sí / postgres | sí / postgres | igual |
| search_path | `public` | `public, pg_temp` | V2 más seguro |
| Locking | SELECT sin lock | `SELECT ... FOR UPDATE` sobre transactions | V2 mejor |
| TX inexistente | `ERR_TX_NOT_FOUND` | `ERR_TRANSACTION_NOT_FOUND` | SAFE DIFFERENCE (route.ts mapea `*_NOT_FOUND`→404 genérico) |
| TX ya reversada | `ERR_ALREADY_REVERSED` | no existe estado 'reversed' vía V2: si `status='voided'` → **idempotente** `{status:'idempotent'}`; si `status<>'completed'` → `ERR_INVALID_STATUS` | SAFE (ver abajo) |
| TX voided | `ERR_ALREADY_VOIDED` | idempotente success | SAFE |
| Autorización | `v_uid` (service_role→COALESCE(p_user_id,auth.uid()) / else auth.uid()); `NULL OR NOT has_store_access_as(v_uid, v_tx.store_id)` → `ERR_UNAUTHORIZED` | idéntica lógica | igual |
| Inventario/stock | UPDATE directo `products.stock_current` (+ lotes `product_lots.quantity_remaining`) | `register_stock_movement(...'sale_reverse')` → stock_movements → trigger `auto_kardex_on_stock_movement` (pipeline single-writer W7) | **INTEGRITY IMPROVEMENT** |
| Kardex | INSERT directo `kardex_entries` (`devolution_in`, unit_cost=0, snapshot de cost_average) | generado por trigger desde el movimiento (PR-4.3 eliminó el INSERT directo) | INTEGRITY IMPROVEMENT |
| WAC | no toca `cost_average` (pero escribe balance con unit_cost=0 — huella imprecisa) | single-writer: solo `fn_recalc_wac` vía pipeline; guard `trg_guard_wac_writer` vigente | INTEGRITY IMPROVEMENT |
| Estado final TX | `status='reversed'` + `reversed_at/reversed_by/reversal_reason` | `status='voided'` + `updated_at`; NO escribe reversed_* | SAFE DIFFERENCE — es el comportamiento productivo vigente desde ~2026-08-08 (flag ON); W9.4.6 confirmó runtime→V2 |
| Auditoría (audit_logs) | **sin INSERT en audit_logs** | INSERT `audit_logs` action=`REVERSE_TRANSACTION_V2`, metadata(reason, units_restored) | INTEGRITY IMPROVEMENT |
| Pagos (payment_transactions) | no resetea pagos | no resetea pagos | PARIDAD (limitación común, no regresión; deuda separada, fuera de scope) |
| Idempotencia | no (error si ya reversada) | sí (voided→idempotent) | INTEGRITY IMPROVEMENT |
| Respuesta | `{status:'success', items_reversed, transaction_id}` | `{status:'success', transaction_id, units_restored}` | SAFE — route.ts devuelve el jsonb tal cual; UI no consume `items_reversed` de forma crítica (hook devuelve `result` completo) |

## Casos históricos que V1 soportaba, cubiertos por V2

1. Venta `completed` → reversión con devolución de stock: **V2 lo hace** (vía register_stock_movement).
2. Venta ya reversada: V1 error explícito; V2 idempotente o ERR_INVALID_STATUS — ambos evitan doble reversión (W9.4.6 F10 lo probó en vivo: v2 idempotente).
3. Acceso cross-store: ambos `ERR_UNAUTHORIZED` (probado en vivo W9.4.6, se repite en FASE 22).
4. service_role con `p_user_id` forjado: ambos neutralizan (auth.uid() NULL + guard store access) — W9.4.6 F9.

## Capacidades que SOLO V1 tiene (candidatas a FUNCTIONAL GAP)

- Escribir `reversed_at/reversed_by/reversal_reason` en la fila: es un efecto colateral de la era V1, no una capacidad demandada por ningún consumidor actual (route.ts ignora el retorno detallado; la UI usa el estado `voided`/`reversed` vía queries de estado, y el flujo productivo ya produce `voided` desde el 08-08). **Clasificado SAFE DIFFERENCE**, con nota: ningún código/consulta de la app filtra por `reversal_reason` o `reversed_by` (verificado por grep en árbol: 0 referencias de lectura a esas columnas fuera de la propia V1 y comentarios).

Verificación de lectores de columnas `reversed_at|reversed_by|reversal_reason` en src/: `grep -rn "reversal_reason\|reversed_by" src/` → 0 resultados en código de aplicación (solo migraciones y tipos generados). El status `reversed` sigue existiendo en el enum para filas históricas; V2 no lo produce y nadie lo requiere producir de nuevo.
