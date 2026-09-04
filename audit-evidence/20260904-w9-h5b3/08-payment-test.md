# W9.4.9 — H5-B3 — GATE 9: PAYMENT SAFETY

Fecha: 2026-09-04 | Contexto: H5-B2 (CLOSED / NO ISSUE @ fd877a53) estableció la inmutabilidad
del ledger de pagos. Este gate NO reabre H5-B2: solo verifica que la CONCURRENCIA de reversión
no pueda generar `duplicate payment mutation` ni mutación indebida alguna.

## Evidencia estructural (cuerpos live, w9h5b3_q4_mutators.sql)

| función | ¿muta payment_transactions? |
|---|---|
| reverse_transaction_v2 | **NO** (su UPDATE de pagos no existe en el cuerpo; el flag `mutates_payments=false` proviene del análisis de cuerpos: no contiene UPDATE/INSERT sobre payment_transactions) |
| void_transaction | **NO** |

Ninguna de las dos rutas de reversión de ventas toca el ledger de pagos:
- reverse_transaction_v2: transactions + transaction_items (SELECT) + stock (vía
  register_stock_movement) + audit_logs. Pagos: 0 sentencias.
- void_transaction: idéntico alcance (con product_variants para conversion_factor).

## Evidencia empírica (prueba concurrente real)

| verificación | resultado |
|---|---|
| payment_transactions de las 6 tx sintéticas | 0 filas en todos los estados (antes y después de carreras, idempotencias y rechazos) |
| payments_total global | PRE=366 → POST=366 (idéntico) |
| pay_checksum global (md5-based) | PRE=797522141631 → POST=797522141631 (idéntico) |
| payments_sum_cup | PRE == POST (24,937,845.0002 CUP, bit a bit) |

## Conclusión

La reversión concurrente (y no concurrente) de transacciones NO muta el ledger de pagos.
El contrato de inmutabilidad de H5-B2 permanece intacto. No se observó ni es posible por
estructura del cuerpo RPC un `duplicate payment mutation`.
