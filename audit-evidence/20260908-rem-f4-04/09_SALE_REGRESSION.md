# 09 — SALE REGRESSION (venta + COGS)

## Objetivo

Demostrar que la remediación de recepción no altera el comportamiento de
ventas ni el costo de ventas (COGS), y que el COGS sale del WAC server-side.

## Estado inicial (fixture VIGA2, producción de pruebas controlada)

```
stock = 19, WAC = 1800
```

## Ejecución (suite F4-04 P5 — checkout real por HTTP)

| Verificación | Resultado |
|---|---|
| Checkout HTTP 2xx | PASS — status **200**, `success:true` |
| transactionId devuelto | PASS — `b553960c-a168-4ad3-990a-00cb6f98fd81` |
| Movimiento de venta registrado | PASS — `{"movement_type":"sale","quantity_change":"-1.0000","unit_cost":"1800.0000000000000000"}` |
| movement qty == −1 | PASS |
| **COGS == qty × WAC == 1 × 1800 == 1800** (server-side, NO 0) | PASS (tol 1e-6) |
| Stock decrementado 19 → 18 | PASS |
| WAC invariante durante la venta (1800) | PASS — la venta NO toca el WAC |

## Puntos de control

1. **COGS = 1800, no 0.** Un WAC roto (0) habría producido COGS=0 y margen
   fantasma. Con la remediación, el WAC alimenta el COGS correctamente.
2. **El WAC no cambia con la venta.** La venta lee el WAC (para COGS) pero
   no lo re-escribe — coherente con el escritor único (`fn_recalc_wac` solo
   se invoca desde flujos de entrada/salida con devolución de costo).
3. **Totales de la transacción:** subtotal 2500, total 2500, tax 0,
   discount 0 — sin efectos colaterales.

## Veredicto

**SALE REGRESSION = PASS** — COGS correcto, stock correcto, WAC invariante.
