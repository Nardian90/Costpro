# FASE D — 07 INVENTORY / TRANSACTION RECONCILIATION

## Regla verificada

```text
cantidad vendida (UI/checkout) == cantidad descontada de stock (movimientos 'sale')
total UI (getExpectedTotalCup) == total persistido (transactions.total_amount)
```

## Evidencia (GET-only, tienda sandbox 241c47df, POST-venta A38FFA6A)

| Elemento | UI / Esperado | Persistido | Estado |
|---|---|---|---|
| Total venta | $150.50 (2 productos: 100.00 + 50.50) | transactions.total = 150.5 | ✓ |
| Líneas | 2 (A×1, B×1) | transaction_items: 2 filas con precios exactos | ✓ |
| Stock A | 20 − 1 = 19 | stock_current = 19 | ✓ |
| Stock B | 8 − 1 = 7 | stock_current = 7 | ✓ |
| Mov. A | sale −1 | stock_movements: (sale, −1.0, balance_after 19.0) | ✓ |
| Mov. B | sale −1 | stock_movements: (sale, −1.0, balance_after 7.0) | ✓ |
| Estado venta | completada | status='completed', payment='cash' | ✓ |

## Reglas contables del sistema observadas (sin modificar)

- El stock del catálogo POS se deriva de `stock_movements` (no del campo plano
  `products.stock_current`) — integridad por movimientos.
- El WAC (`cost_average`) tiene escritor único (`fn_recalc_wac`): UPDATE directo
  rechazado con `ERR_WAC_SINGLE_WRITER_VIOLATION`. La venta exige WAC documentado
  (`ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED`) — trazabilidad de costo obligatoria.
- El checkout exige turno de caja abierto (cash_closures 'pendiente').
- Idempotencia por `idempotency_key` (único escritor de ventas: create_sale_v2).

## Limpieza de fixtures (§32)

```text
ELIMINADOS por ID: transaction_items, stock_movements, productos (2),
                   membership, perfil (soft-delete sancionado managed_soft_delete_user)
BLOQUEADOS por gobernanza del sistema (documentados, no es un fallo):
  transactions (3 ventas sintéticas) — FK de payment_transactions + triggers
  auth user — "auth.users preserved" (diseño del propio RPC)
  store sandbox — FK/trigger (igual que los fixtures E2E históricos del sistema)
Impacto: NULO en producción (ver documento 10).
```
