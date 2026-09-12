# REM-INV-1 — 05/06 RECEPCIONES + SERVICIOS (Fase 5)

## Recepciones (evidencia: e1, e5, e9, d3, r06, r16)

- Flujo vigente: `register_reception` (crea receipt `pending` con items y tasa) → `confirm_pending_reception` (FOR UPDATE, status-guard, has_store_access_as, **doctrina W62-01: WAC primero con unit_cost×tasa_cambio_recepcion → movimiento 'purchase' con unit_cost_cup**) → `calculate_receipt_total_cup`.
- Reversión: `reverse_receipt_v2` (inversa exacta por ítem: fn_recalc_wac(-q, uc_cup) + movimiento `purchase_reverse` −q; estado reversed; pagos reseteados a unpaid + marcado en notes; rol `can_reverse_document` B-10; v1 `reverse_receipt` postgres/service_role only).
- `receive_to_warehouse` (V2.12.18): validación tienda+producto, vía register_stock_movement; **no recalcula WAC** (comentario lo promete — código no lo hace) — mitigado: service_role only; P3 anotado.
- `fn_process_receipt` (2 overloads, service_role only): identidad anti-spoof (p_user_id==auth.uid()), FOR UPDATE; **[1] fallback SKU cross-store → F-07**.
- `check_reception_cost_variation` (trigger receipt_items): alerta variación de costo entre recepciones.
- Linkage doc↔movimiento: NO persistido (F-04).

COSTO_TOTAL = MERCANCÍA (receipt_items.unit_cost × qty, convertido por tasa) — los SERVICIOS se prorratean aparte (service_cost_distributions) y entran al PMP vía register_stock_movement (A2, hoy código muerto F-10). Verificado: no duplicación, no negativos, no cruce de tienda en el flujo vigente (r12a: sin datos de uso).

## Servicios (r12a; OBS-1)

14 received_services (activos 3, voided 11) — **0 prorrateos ejecutados**. `distribute_service_cost_v` es idempotente por diseño (DELETE+INSERT en transacción, prorrateo por % sobre receipt_items, sin valores negativos en código). Feature viva sin uso ni tests → cobertura pendiente; sin hallazgo de corrupción posible de demostrar con datos.
