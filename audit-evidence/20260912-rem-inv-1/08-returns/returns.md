# REM-INV-1 — 08 DEVOLUCIONES Y ANULACIONES (Fase 7)

Evidencia: 08-returns (d1,d2,r10), e5 (create_devolution ×2, create_devolution_v2, reverse_devolution, reverse_transaction_v2, void_transaction).

- **ESTADO+OPERACIÓN+REVERSIÓN=ESTADO**: demostrado en flujos v2 — reverse_transaction_v2 (status-idempotente, register con cost_at_sale, rol B-8), reverse_devolution (recalc + register, lock), reverse_receipt_v2 (inversa exacta por ítem).
- **F-02 (P1)**: 13 devoluciones de TIENDA CENTRAL (12 completed, 1 reversed) SIN movimientos/kardex/pagos — incluida NC-000008-2026 por 999u = 349,650 CUP ("Hot dev qty test"). Total en documentos sin respaldo: 353,850 CUP. Root: overload v1[0] de create_devolution (UPDATE products directo + kardex sin movimiento; las huellas fueron barridas por limpiezas posteriores; los docs no). La reversión NC-000007 tampoco tocó ledger (no había nada que compensar) — coherente con estado previo pero confirma que el camino v1 no deja rastro.
- Defensas vigentes (create_devolution_v2): FOR UPDATE de la venta original + tope acumulado vendido/devuelto (ERR_DEVOLUTION_CAP_EXCEEDED) + ERR_CROSS_STORE + whitelist de métodos + idempotency_key. El v1 es inalcanzable para usuarios (grant postgres/service_role) pero los datos residuales persisten.
- Doble reversión: impedida por guards de status (idempotente en v2) en todas las rutas auditadas.
