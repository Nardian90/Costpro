# REM-INV-1 — 13 ACCOUNTING CONSISTENCY MATRIX (Fase 12)

| Operación | Stock | Costo (WAC) | Valor (kardex) | Documento | Auditoría | Reversible | Idempotente |
|---|---|---|---|---|---|---|---|
| Compra (register_reception→confirm_pending_reception) | ✓ trigger chain | ✓ recalc WAC-first (W62-01) | ✓ | receipts+items | audit_logs+wac_log | ✓ reverse_receipt_v2 (FOR UPDATE, rol B-10, reset pagos R3) | status pending→active + FOR UPDATE (sin key explícita — F-08) |
| Compra v1 (receive_purchase) | ⚠ sin guardas | ✗ sin recalc | parcial | purchase_orders | mínima | ✗ | ✗ doble-recepción (F-01) |
| Servicios asociados (distribute_service_cost_v) | n/a | blend vía register_stock_movement A2 parcial (código muerto v_dist_costs — F-10) | — | received_services+distributions | audit | set_received_service_status | DELETE+INSERT en tx (idempotente por diseño; 0 usos reales — OBS-1) |
| Devolución de venta (create_devolution_v2) | ✓ return vía register | A1 invariante (diseño DF-01) | ✓ kardex 1:1 | devolutions (idempotency_key, cap DF-07, FOR UPDATE) | audit_logs | ✓ reverse_devolution (recalc, lock) | ✓ key + tope acumulado |
| Devolución v1 (create_devolution[0]) | ✗ sin movimientos | ✗ | kardex directo (sin movimiento) | devolutions | mínima | parcial | ✗ → F-02 docs fantasma |
| Venta (create_sale_v2) | ✓ vía register | salida invariante (A1) | ⚠ unit_cost=0 heredado (F-03) | transactions+items (FOR UPDATE, idem key) | audit_events | ✓ reverse_transaction_v2 (rol B-8, status-idempotente) | ✓ |
| Transferencia (create/confirm/reverse) | ✓ salida=entrada (8/8 balanceadas — r05) | ✓ confirm recalc transfer_in; valoración B al costo de A (transfer_items.unit_cost) | ✓ | transfers+items (approval_rules) | audit_logs | ✓ reverse_transfer (recalc, FOR UPDATE) | status-guard only (F-08) |
| Ajuste (perform/confirm/reverse_inventory_adjustment_v) | ✓ | ✓ perform recalc | ✓ | adjustments+items (workflow draft→confirmed) | audit_logs | ✓ reverse (lock, recalc) | status-guard (F-08) |
| Producción (create/close v2, withdraw_v3, receive_output) | ✓ out/in por ítem | ✓ receive_output recalc production_in | semántica 'adjustment' (F-09) | production_orders (39 cols, idem en create/close) | audit + wac_log | ✓ reverse_production_order + void_closed (recalc, locks) | ✓ (receive_output idem, close status) |
| Anulación de venta (void_transaction) | ✓ compensa | invariante | ✓ | transactions (void_reason, validators) | fn_audit_transaction_voiding | n/a | status (idempotente) |
| Pago (payment_transactions) | n/a | n/a | n/a | ref por tipo (sale 427, devolution 12, receipt 3, production 12, service 3, work 1) | — | marcado en notes (R3) | por ruta origen |

**Casos STOCK=✓ pero VALOR=✗**: ventas heredadas (F-03), kardex pre-image (F-05), NC fantasma (F-02 — doc=✗/stock=✓).
**Casos VALOR=✓ pero STOCK=✗**: no detectados.
