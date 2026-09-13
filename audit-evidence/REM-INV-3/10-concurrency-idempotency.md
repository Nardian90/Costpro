# REM-INV-3 — FASE 14/15 — Atomicidad, concurrencia e idempotencia (staging)

## 1. Atomicidad (FASE 14)

Prueba: NC de 2 ítems donde el ítem 1 es válido (P1, ST_A) y el ítem 2 referencia
un producto de OTRA tienda (P2_B, ST_B). El pipeline canónico dispara
ERR_STORE_MISMATCH (fn_sync_inventory_on_movement) DESPUÉS de haber insertado
devolution+ítem1 y de haber creado el movimiento del ítem 1.

Resultado: PASS — la excepción aborta la transacción completa (SECURITY DEFINER,
un solo bloque plpgsql). Comparación pre/post de 8 contadores:
devolutions 4→4, dev_items 4→4, stock_movements 5→5, kardex 5→5, cash_out 4→4,
payments_refund 4→4, audit_created 4→4, audit_reverse 1→1.

Conclusión: NO puede ocurrir "NC creada pero stock no revertido" (ni ninguna
combinación parcial) bajo la función viva: documento, inventario y efecto
financiero comparten transacción.

## 2. Concurrencia (FASE 15)

G1 — carrera sobre el tope: dos sesiones paralelas crean una NC de 1 u sobre la
misma venta de 1 u (keys distintas). Resultado PASS: exactamente 1 éxito; la otra
sesión recibe ERR_DEVOLUTION_CAP_EXCEEDED. Mecanismo: SELECT … FOR UPDATE de la
venta (DF-07) serializa; el segundo relee el acumulado devuelto DESPUÉS de
adquirir el lock. 1 documento, 1 movimiento, 1 efecto.

G2 — carrera sobre la misma idempotency_key: dos sesiones paralelas con la MISMA
key. Resultado PASS: 1 documento en la tabla (índice único parcial
devolutions_idempotency_key_idx, migración v2_17_2 2026-08-04). El perdedor
obtiene el rechazo por tope/índice; nunca 2 documentos idénticos.

## 3. Idempotencia semántica

- Replay de la misma key en serie: status='idempotent', MISMO devolution_id, y
  los 6 contadores de efectos sin cambios (PASS).
- Nota de diseño: el backend genera una key NUEVA por request
  (`dev-${crypto.randomUUID()}` en route.ts) — la idempotencia por key protege
  contra replay del MISMO request, no contra doble click de usuario (que genera
  dos requests distintos). Para doble click el tope acumulado (venta, producto)
  actúa como segunda barrera: un doble click real sobre una venta de 1 u produce
  1 éxito + 1 ERR_DEVOLUTION_CAP_EXCEEDED (probado en G1).
- Offline queue/replay: no existe un path offline de devoluciones (módulo UI
  dormant; useReverseDocument no está en la cola offline). Sin puerta de replay.

## 4. Duplicidad financiera

El contra-asiento de reembolso lleva idempotency_key estructurada
'dev-{devolution_id}-refund' (payment_transactions) y el ledger de store_credit
'dev-{devolution_id}-credit'. Bajo atomicidad G1/G2, la duplicidad financiera por
carrera queda bloqueada por el tope; la duplicidad por replay queda bloqueada por
la key estructurada y por el id del documento.
