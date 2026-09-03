# W9.4.6 — H-5 · FASES 7-12 · Análisis semántico, autorización, WAC, pagos, auditoría, locking, search_path

Cuerpos fuente: `02-live-function-definitions.sql` (producción, verbatim). Funciones soporte: `raw/f2_fn_*.json`.

## A. Autorización

Ambas versiones comparten el mismo patrón de identidad (introducido en V2.12.9 anti-spoofing, commit `20260727000006`):

```sql
v_uid := CASE WHEN auth.role() = 'service_role'
              THEN COALESCE(p_user_id, auth.uid())
              ELSE auth.uid() END;
...
IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_store_id) THEN
  RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
```

- Para callers NO service_role: **`p_user_id` es IGNORADO** (usa `auth.uid()` del JWT) → suplantación via p_user_id imposible desde authenticated (además, authenticated ni siquiera tiene EXECUTE desde W9 C2).
- Para service_role: `p_user_id` se acepta como actor designado — patrón legítimo "act-as" porque la ruta `/api/reverse` lo fija desde `session.user.id` (server-injected, no forjable por el cliente) y luego el propio guard valida membresía de ESE usuario en la tienda de la transacción.
- `has_store_access_as`: admin global OR `user_store_memberships(status='active')`. Determinista y con guard NULL → false.

**Riesgo residual (dependencia de disciplina del servidor)**: un service_role que pase un `p_user_id` arbitrario ejecutaría con identidad designada — pero la función AÚN valida `has_store_access_as(p_user_id, store)` ⇒ incluso un p_user_id "falso" es rechazado si ese usuario no pertenece a la tienda. No es bypass; es delegación auditada.

## B. Scope de store / C. Tenant

- Guard sobre `v_tx.store_id` (extraído de la fila, no del cliente) en ambas. FIX V2.3 aplicado.
- Tenant: `transactions.tenant_id` existe en el esquema, pero NINGUNA versión valida `tenant_id` explícitamente; el aislamiento de facto es por `store_id` (modelo CostPro: tenant ≈ conjunto de tiendas del operador; `has_store_access_as` alcanza con membresía activa). RLS directo sobre `transactions` no aplica dentro de la SECURITY DEFINER (owner postgres). Evaluación: **no cross-tenant via esta RPC** — el guard de store es la barrera real, y está probada en FASE 10.

## D. Estado de transacción

| | V1 | V2 |
|---|---|---|
| pre-check | `status='reversed'`→ERR; `status='voided'`→ERR | `voided`→idempotente OK; `status<>'completed'`→ERR_INVALID_STATUS |
| final | `reversed` + reversed_at/by/reason | `voided` (solo updated_at) |
| transición (fn_validate_document_transition) | completed→reversed VÁLIDA | completed→voided VÁLIDA |
| efecto en dinero (app) | `cash-report/details` usa `.neq('status','voided')` ⇒ **incluye 'reversed'** ⇒ venta reversible sigue contando en caja tras V1 | `voided` excluida de caja ✔; `sales/summary` solo cuenta `completed` (correcto en ambos) |
| comisiones | trigger `reverse_commissions_on_sale_void` dispara con voided Y reversed ✔ ambas | ídem |

**Divergencia semántica real**: V1 marca `reversed` y las vistas de dinero no lo filtran; V2 marca `voided` que sí está filtrado. V2 es coherente con el modelo de dinero; V1 deja doble conteo de caja tras reversión (P3, solo flag OFF).

## E. Inventario

- **V1**: `UPDATE products SET stock_current = stock_current + qty` (sin fila en stock_movements, sin tocar `inventory`, sin FOR UPDATE) + restaura `product_lots` + kardex directo `devolution_in` unit_cost=0.
  - ⚠ Divergencia de fuentes de verdad: `inventory.quantity` queda SIN actualizar (pipeline oficial la sincroniza vía `fn_sync_inventory_on_movement`). El repo ya corrigió en `5e2fa2a` que "RPC lee stock de inventory.quantity (fuente de verdad)" ⇒ tras una reversión V1, inventory y products.stock_current divergen.
  - ⚠ Kardex con `unit_cost=0` y tipo `devolution_in` — taxonomía inconsistente con `sale_reverse` (cost_at_sale) del pipeline.
  - ⚠ Sin FOR UPDATE: carrera read-modify-write sobre `stock_current` concurrente con `sync_product_stock` (que escribe stock_current desde `balance_after` de la última movida) ⇒ posible pérdida de restauración.
- **V2**: `register_stock_movement('sale_reverse', unit_cost=cost_at_sale, skip_access_check=TRUE)` → BEFORE trigger valida producto/tienda y sincroniza `inventory` (ERR_INSUFFICIENT_STOCK si negativo — imposible en reversa de venta, entrada) → AFTER triggers generan kardex `sale_reverse` y sincronizan `products.stock_current` desde `balance_after`. FOR UPDATE sobre transactions. **Pipeline single-writer respetado.**

## F. WAC / single-writer

- Guard activo: trigger `trg_guard_wac_writer` BEFORE UPDATE OF cost_average ON products (fn `w62_guard_wac_writer`, exige `app.wac_writer='fn_recalc_wac'`; sin token → `ERR_WAC_SINGLE_WRITER_VIOLATION`).
- **Ninguna versión escribe `cost_average`** (ni GREATEST(0), ni UPDATE directo). V1 no recalcúa WAC (invariante de facto); V2 tampoco (A2 hotfix: `register_stock_movement` ya no recalcula WAC; para `sale_reverse` —devolución de salida— WAC invariante es semánticamente correcto: la mercancía vuelve al costo al que salió, y `fn_recalc_wac` declara "Salida pura / devolución A1: WAC INVARIANTE").
- Conclusión: **sin conflicto con el modelo W7**. (Nota: `fn_recalc_wac` usa `search_path=public, extensions` — fuera de alcance; registrado como observación preexistente, ya conocida de H-1/H-4.)

## G. Pagos

- `payment_transactions` (18 columnas; link por `transaction_id` y por `ref_type/ref_id`).
- **Ninguna versión (V1 ni V2) resetea/marca `payment_transactions`** al revertir una venta.
- Comparación con H-4 (receipts/PR-4): ahí el patrón corregido resetea payment_transactions con nota ` [REVERSED…]`. En ventas NO existe equivalente ni en V1 ni en V2 ni en el repo.
- Impacto real medido (FASE 12): las consultas de dinero filtran por `transactions.status` (caja excluye `voided`; summary solo `completed`), por lo que el dinero de una venta revertida no se cuenta dos veces en las vistas principales; las FILAS de pago quedan con el estado original. `trg_validate_payment_invariants` y `trg_update_payment_status` en payment_transactions no son invocados por la reversión.
- Evaluación: GAP de trazabilidad de pagos reversados (los pagos permanecen 'paid'/'confirmed' apuntando a una venta anulada) — **P3 documental/backlog**, no pérdida de integridad contable activa (las vistas no los suman para la venta anulada). Riesgo futuro si se construyen reportes sobre payment_transactions sin join a status.

## H. Auditoría

- V1: no inserta `audit_logs`; solo trigger genérico `log_transaction_changes` → action `UPDATE_STATUS` con user_id `COALESCE(auth.uid(), seller_id)`. Razón de reversión queda en `transactions.reversal_reason`; actor en `reversed_by`.
- V2: inserta `audit_logs(action='REVERSE_TRANSACTION_V2', record_id, store_id, user_id=v_caller_uid, metadata{reason, units_restored})` + el trigger genérico.
- Actor: V2 usa v_caller_uid (identidad real o designada validada). Trigger genérico usa auth.uid() (NULL con service_role → cae a seller_id: atribución imperfecta pero preexistente y documentada).

## I. Locking

- V1: sin `FOR UPDATE` en `transactions` ni en `products` (races: doble reversión concurrente posible en V1 si ambas leen status='completed' antes de escribir — mitigado por UPDATE final idempotente... no: dos transacciones simultáneas ambas restaurarían stock ⇒ doble devolución). **V1 vulnerable a doble-restauración concurrente (P2, mitigado: V1 solo alcanzable con flag OFF y ACL service_role).**
- V2: `FOR UPDATE` sobre la fila de transactions serializa reversiones concurrentes; idempotencia por estado `voided`.

## J. Search path

- V1: `SET search_path TO 'public'` — pg_temp implícito PRIMERO (patrón no endurecido H-1). Mitigación estructural: **todas** las referencias del cuerpo están cualificadas (`public.*`, `auth.*`; únicos no cualificados: builtins pg_catalog). Riesgo de shadowing ≈ 0 en la práctica ⇒ P3 hardening.
- V2: `SET search_path TO 'public, pg_temp'` — patrón endurecido H-1 ✔.
- Nota: `register_stock_movement` y `has_store_access_as` (llamadas por V2/V1) tienen `search_path=public` — misma mitigación (cuerpos cualificados). Fuera de scope endurecerlas aquí (hallazgo menor, no de reverse_transaction).

## Veredicto FASE 5 — Canónica

**`reverse_transaction_v2` (PR-4, oid 138188) ES la versión canónica**, por:
1. Único consumidor runtime (flag USE_V2_REVERSE=true en .env y en `.env.example`).
2. Única con pipeline single-writer (stock_movements→inventory→kardex→products).
3. Única con audit_logs explícito + locking + idempotencia.
4. Única semánticamente coherente con las vistas de dinero (`voided` filtrado).
5. Producción == repo PR-4 (SIN drift) — a diferencia de H-4, aquí el despliegue es íntegro.
6. Coincide con la release auditada W7 (`1c204d1` consolidó PR-4 dentro del release; verificado por comparación exacta de cuerpos).

V1 = legacy flag-OFF con defectos conocidos (sin drift, sin exposición). La simetría con H-4 se rompe en un punto clave: **aquí no hay drift ni exposición ACL**.
