# REM-INV-1 — 09 PRODUCCIÓN (Fase 8)

Evidencia: 09-production (d5, r09), e1/e5 (create/close_production_order_v2, receive_production_output, reverse_production_order, void_closed_production_order, withdraw_production_item_v3), e8.

- Relación con REM-PO-1: la familia production_orders ya fue certificada en seguridad (5 CRITICAL + MEDIUM, auth.uid(), grants bit-exactos). Esta fase audita INTEGRIDAD ECONÓMICA — no se repiten tests de seguridad.
- Flujos: create_production_order_v2 (idem key, presupuesto) → withdraw_production_item_v3 (salida MP por ítem, idem key, lock; deprecated_9arg aislado) → receive_production_output (entrada PT, FOR UPDATE, idempotencia, recalc WAC 'production_in') → close_production_order_v2 (lock, status, cierre con total).
- Reversión: reverse_production_order (recalc 'production_reverse', movimientos compensatorios, lock) y void_closed_production_order (recalc 'production_void').
- Datos live: 89 órdenes (in_progress 42, draft 13, closed 26, reversed 2, voided 6); agregados: production_in +91, production_out −52, production_reverse −25. Sin órdenes cerradas sin entrada asociada detectable por FK (linkage solo por reference_doc — F-04).
- WAC de PT: recalc con 30 eventos production_in — la entrada de producto terminado SÍ participa del blend.
- Merma: sin campo específico en el flujo (exceso/merma vía exceso_qty en items — usado por withdraw_v3); observabilidad P3.
- Aislamiento por tienda: has_store_access_as en todos + store-mismatch guard H-01 en el trigger (movement.store_id debe == products.store_id).
