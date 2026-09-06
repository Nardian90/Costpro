# W9.5 — B-10b-OBS-2-R2 · 05-sale-test.md
# GATE 4 + GATE 5 — SIMULACIÓN MATEMÁTICA Y VENTA SINTÉTICA · PASS

## GATE 4 — reconstrucción matemática previa (nunca asumir stock_current como única verdad)

Para cada operación se fijó el resultado esperado ANTES de ejecutar el pipeline real:

| # | Operación | stock_before | q | expected_stock_after | Base del cálculo |
|---|---|---:|---:|---:|---|
| 1 | Venta cash A (tx1) | 19 | 2 | **17** | initial(19) del batch R1 == inventory == stock_current |
| 2 | Venta zelle A (tx2) | 17 | 1 | **16** | 17 = 19 − 2 |
| 3 | Void tx1 (POS undo) | 16 | +2 | **18** | 16 + 2 |
| 4 | Reverse tx2 (admin) | 18 | +1 | **19** | 18 + 1 |
| 5 | Venta decimal B | 95.5 | 1.5 | **94.0000** | 95.5 − 1.5 |
| 6 | Void decimal | 94.0 | +1.5 | **95.5000** | 94 + 1.5 |
| 7 | Venta C (high) | 966 | 1 | **965** | 966 − 1 |
| 8 | Void C | 965 | +1 | **966** | 965 + 1 |
| 9 | Venta B2 | 91.5 | 1 | **90.5** | 91.5 − 1 |
| 10 | Void B2 | 90.5 | +1 | **91.5000** | 90.5 + 1 |
| — | Negative C | 966 | 1000 | **REJECT** | 1000 > 966 |

Fuente de verdad del stock_before: Σ ledger (movement `initial` del batch congelado) cruzada contra inventory.quantity y products.stock_current (GATE 1: triada 98/98 sin mismatches).

## GATE 5 — ejecución de venta sintética por el pipeline canónico

Mecanismo: `create_sale_v2` (SECURITY DEFINER, ACL authenticated) invocada en transacción única `BEGIN … ROLLBACK` (Modelo A — `scripts/r2_master_test.sql`, acta `raw/r2_master_result.json`), con JWT claims del actor (`auth.uid()=051c6157`, `auth.role()=authenticated`).

- **Identidad**: `v_uid = auth.uid()` (claims); `p_user_id` NO usado (no-service_role) — la identidad forjada por cliente es imposible por diseño (P14b lo demuestra).
- **Pipeline interno observado** (definiciones congeladas en `raw/r2_fn_defs.json`): advisory lock por tienda → idempotencia → auth → FOR UPDATE de products (serializa stock+WAC) → costo SIEMPRE del servidor (`cost_at_sale = WAC_prev`, DF-02; claves de costo del cliente IGNORADAS) → INSERT transactions (`completed`) → `register_stock_movement('sale', −units)` → INSERT transaction_items → payment_transactions → **I1b: |SUM(amount_cup) − total| ≤ 0.01** → audit CREATE_SALE_V2.
- **No se ejecutó** ningún UPDATE directo sobre products/inventory/stock_movements; todo pasó por `create_sale_v2 → register_stock_movement` y triggers (`fn_sync_inventory_on_movement`, `auto_kardex_on_stock_movement`, `sync_product_stock`).

## Resultado (P1/P2/P5 — detalle en 06/07/09)

```text
P1_SALE_FA_cash700: PASS — status=success, calculated_total=700
P2 stock tras venta: 17 == 17 == 17 (stock_current == inventory == Σledger)
P5 invariante I1b: SUM(amount_cup)=700 == total_amount=700
```

Los 5 movimientos `initial` del batch R1 permanecieron intactos durante todas las operaciones (P4b fingerprints in-tx == PRE; POST 98/98 idénticos).

## Veredicto GATE 4 + GATE 5

```text
PASS — el inventario reparado entra al ciclo operativo real sin desviaciones
```
