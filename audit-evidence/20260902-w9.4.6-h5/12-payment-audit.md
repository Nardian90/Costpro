# W9.4.6 — H-5 · FASES 7.G + 12 · Pagos y auditoría

## Pagos (7.G / 12)

Esquema `payment_transactions`: link a la venta por `transaction_id` (uuid) y por `ref_type/ref_id`; triggers propios: `trg_validate_payment_invariants` (BEFORE), `trg_update_payment_status` (AFTER), `trg_audit_payment_transactions_changes` (AFTER).

### Comportamiento observado en las dos versiones

| | V1 | V2 |
|---|---|---|
| ¿Toca payment_transactions? | NO | NO |
| ¿Marca la venta? | status→`reversed` | status→`voided` |
| ¿Reset `paid`→`reversed`? | NO | NO |

**Comparación con el patrón corregido de H-4** (PR-4 de receipts): allí `reverse_receipt_v2` resetea `payment_transactions` con nota ` [REVERSED…]`. Para VENTAS no existe equivalente en ninguna versión ni migración — el gap es de diseño histórico del par, no drift.

### Impacto real (medido contra los consumidores de dinero)

- `cash-report/details` (ventas): `.neq('status','voided')` → excluye ventas V2-revertidas ✔; **incluye** ventas V1-revertidas (status `reversed`) ⇒ doble conteo de caja bajo V1.
- `sales/summary`: `.eq('status','completed')` → correcto con ambas.
- Los pagos individuales permanecen con su estado original apuntando a una venta anulada; no se suman dos veces en las vistas principales porque estas agregan por transacciones/status, no por payment_transactions.
- **Clasificación: P3 — gap de trazabilidad de pagos en reversiones de venta** (paid→voided sin marcado del pago). No produce pérdida contable activa hoy; se recomienda decisión de producto en backlog: replicar el patrón H-4 (reset/marcado de payment_transactions) cuando se consolide una única función canónica.

## Auditoría (7.H)

| | V1 | V2 |
|---|---|---|
| INSERT audit_logs explícito | NO | SÍ: `REVERSE_TRANSACTION_V2` (record_id, store_id, user_id, metadata{reason, units_restored}) — verificado en vivo P6 |
| Trigger genérico `log_transaction_changes` | SÍ: action `UPDATE_STATUS` (old/new status), user_id `COALESCE(auth.uid(), seller_id)` | SÍ (adicional) |
| Campos de trazabilidad en la fila | `reversed_at`, `reversed_by`, `reversal_reason` — verificado en vivo P10 | NO (razón solo en audit_logs) |
| Actor efectivo | v_uid real (P10: reversed_by=miembro) | v_uid real (P6: user_id=miembro) |
| Action canónico | ausente (solo UPDATE_STATUS) | `REVERSE_TRANSACTION_V2` |

- Acciones históricas buscadas (`REVERSE_TRANSACTION`, `TRANSACTION_REVERSED`, `REVERSE_TRANSACTION_V2`): en producción solo existen filas nuevas si se ejecutó la RPC; la tabla audit_logs del baseline (7375) no registra reversiones de venta previas (tx_reversed=0, tx_voided=0 — coherente con una plataforma donde la reversión de ventas nunca se ha usado en producción).
- Comisiones: trigger `reverse_commissions_on_sale_void` cubre AMBOS estados finales (voided/reversed) → flaggeo `COMMISSION_FLAGGED_FOR_REVIEW`. Paridad completa.
- Clasificación: V1 con auditoría débil (sin action canónico) — P3, flag OFF only.

## Idempotencia/estado

- V2: `completed→voided` única transición; 2ª llamada → `{"status":"idempotent"}` (P7) — consistente con `fn_validate_document_transition` (voided terminal).
- V1: rechaza `reversed`/`voided` previos (P8) — pero sin FOR UPDATE existe ventana concurrente teórica (P3: solo service_role).
