# REM-INV-2 — 13: CONCURRENCIA (staging aislado)

Protocolo: dos sesiones simultáneas T1/T2 recibiendo la misma compra; medir movimientos, stock, WAC, estado del documento, audit; esperado exactamente una recepción efectiva, sin lost update, sin double stock, sin WAC corruption.

## 1. Diseño

PO_CC (draft, item qty 10 @ 5). Dos conexiones psycopg2 independientes (transacciones separadas), sincronizadas con `threading.Barrier`, ambas ejecutan `SELECT receive_purchase(PO_CC)` y hacen commit. `lock_timeout=3s` para revelar contención real.

## 2. Resultado

```text
[FAIL (both committed — double stock, no lock/status-guard)] two concurrent sessions receive same purchase :: outcomes=['committed', 'committed']; stock delta=20 (ordered 10); movements=2
```

Lectura literal: `outcomes=['committed','committed']` — **ambas sesiones terminaron con éxito**; delta de stock = **20** (se ordenaron 10); movimientos = **2**.

## 3. Análisis

- No hay `FOR UPDATE` ni sobre `purchase_orders` ni sobre `purchase_items`: ninguna sesión espera a la otra.
- La acumulación `ON CONFLICT DO UPDATE SET quantity = quantity + r.quantity` es atómica por fila pero **no idempotente**: dos lecturas del mismo item producen dos sumas.
- El guard de estado no existe, así que el `status='received'` de T1 no detiene a T2.
- Resultado: double stock + kardex duplicado + received_at sobrescrito. (El WAC no se corrompe porque nunca se toca — ver 10.)

## 4. Contraste

La canónica serializa con `FOR UPDATE` sobre la OC (`receive_against_po`) o sobre el receipt (`confirm_pending_reception`) más guard de estado; la segunda transacción queda en cola y al obtener el lock explota con `ERR_PO_NOT_RECEIVABLE`/`ERR_RECEIPT_ALREADY_CONFIRMED` sin efectos. Control CONCURRENCIA V1: **FAIL**.
