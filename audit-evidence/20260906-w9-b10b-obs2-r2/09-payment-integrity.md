# W9.5 — B-10b-OBS-2-R2 · 09-payment-integrity.md
# GATE 9 — PAYMENT / FINANCIAL FLOW · PASS

El pipeline de venta crea `payment_transactions` (fuente autoritativa de pagos, aprendizaje W9.4.8 integrado en `create_sale_v2`).

## Escenario 1 — venta cash (P5)

```text
transaction:  total_amount=700 · payment_method=cash · sale_currency=CUP · sale_exchange_rate=1
items:        1 × (qty=2, price_at_sale=350, cost_at_sale=489.999…9700, price_at_sale_cup=700)
payment:      1 fila · amount=700 · currency=CUP · exchange_rate=1.0 · method=cash
amount_cup:   700  (columna GENERATED STORED: CASE WHEN currency='CUP' THEN amount ELSE amount*exchange_rate END)
INVARIANTE:   SUM(payment_transactions.amount_cup) == transaction.total_amount  →  700 == 700  ✓
```

## Escenario 2 — venta zelle USD (P6, W9.4.8: NO double conversion)

```text
transaction:  total_amount=350 · payment_method=zelle · sale_currency=USD · sale_exchange_rate=440
payment:      amount = 350/440 (moneda ORIGINAL, p.ej. 0.79545…) · currency=USD · exchange_rate=440
amount_cup:   GENERATED = amount × exchange_rate = 350.0000000000000000 (≡ total, tolerancia I1b 0.01)
INVARIANTE:   SUM(amount_cup) = 350 == total_amount = 350                        ✓
```

La función exige explícitamente `p_sale_currency != 'CUP' ∧ rate > 1` para zelle (ERR_ZELLE_REQUIRES_RATE) y almacena el monto **en la moneda original** (`v_zelle_original_amount := v_zelle_amt / rate`), de modo que `amount_cup` reconstruye el total CUP exactamente **una** vez — la doble conversión USD→CUP queda estructuralmente imposible en este path.

## Validaciones adicionales observadas

```text
ERR_TOTAL_MISMATCH      — el servidor recalcula subtotal/descuento/impuesto y valida vs cliente (±0.01)
I1b ERR_PAYMENT_INVARIANT_VIOLATED — post-INSERT: Σamount_cup vs total (±0.01)
idempotency_key de pago — 'pay-cash-<tx_id>' / 'pay-zelle-<tx_id>' (dedupe natural)
```

## Zero residue

Las 6 filas de pago sintéticas (cash 700, zelle USD, cash 6.75, cash 350, cash 4.5 + asociadas) existieron SOLO dentro de la transacción ROLLBACK: `payments_all 366 → 366` en POST (GATE 23/25).

## Veredicto GATE 9

```text
PASS — pagos coherentes; sin doble conversión; sin duplicación; invariante I1b activa
```
