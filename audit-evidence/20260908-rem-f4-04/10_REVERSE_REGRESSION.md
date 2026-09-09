# 10 — REVERSE REGRESSION (reversa de venta)

## Objetivo

Demostrar que la reversa de una venta restaura el estado exacto (stock y
ledger), sin doble efecto y sin alterar el WAC, tras la remediación.

## Ejecución (suite F4-04 P6 — reversa de la venta de 09_SALE_REGRESSION)

Transacción: `b553960c-a168-4ad3-990a-00cb6f98fd81` (venta 1 unidad de VIGA2
@ WAC 1800, stock 19 → 18).

| Verificación | Resultado |
|---|---|
| Reversa HTTP 2xx | PASS — status **200**, `status:success`, `units_restored:1` |
| Stock restaurado 18 → **19** | PASS |
| **WAC inalterado tras reversa: 1800** | PASS (tol 1e-6) |
| Transacción marcada `voided` | PASS |
| Movimientos del ledger | PASS — `sale_reverse +1.0000` y `sale −1.0000` (par exacto) |

## Invariantes verificados

1. **`stock_before − qty = stock_after` y su inversa exacta** en la reversa:
   19 → 18 (venta) → 19 (reversa).
2. **Reversa sin doble efecto:** exactamente 1 movimiento de reversa por
   venta; la segunda reversa no está permitida por la transacción `voided`.
3. **El WAC no se altera por la reversa** (1800 antes y después) — la reversa
   restaura unidades, no re-precifica inventario.
4. **Sin base de comisión fantasma** (control de flujo sano verificado en
   RECON y preservado: transacción `voided` no genera comisiones).

## Veredicto

**REVERSE REGRESSION = PASS** — estado exacto restaurado, ledger par
sale/sale_reverse, WAC estable.
