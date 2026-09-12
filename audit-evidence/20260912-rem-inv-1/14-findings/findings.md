# REM-INV-1 — 14 FINDINGS (Fase 13 / §19)

Metodología: INSPECT→MODEL→REPRODUCE/MEASURE (read-only)→CLASSIFY→ROOT CAUSE→PROPOSE. Producción ZERO-TOUCH (fingerprint sha256 idéntico antes/después). Sin mutaciones, sin fixes.

**RESUMEN: P0=0 · P1=3 · P2=5 · P3=2 · OBS=3**

---

## F-01 · P1 · `receive_purchase` v1: doble recepción sin guardas (camino vivo)

- **PRECONDITION**: usuario authenticated; `purchase_orders` con filas en `purchase_items` (hoy 0 filas — latente; tabla existe).
- **REPRODUCTION** (por lectura de código; no ejecutado en producción por §3): llamar `receive_purchase(po_id)` ×2 → cada llamada re-inserta movimientos 'purchase' + suma inventory nuevamente (upsert ON CONFLICT DO UPDATE quantity+=), sin chequear status (`UPDATE … SET status='received'` incondicional), sin `has_store_access`, sin `fn_recalc_wac` (E6: recalc=False).
- **EXPECTED**: una sola recepción por PO; acceso validado; WAC recalculado.
- **ACTUAL**: guardas ausentes; grant `{postgres, authenticated, service_role}` (r13).
- **DB DELTA potencial**: stock inflado duplicado + WAC desactualizado (entrada sin blend).
- **BUSINESS IMPACT**: inflado de inventario y costo huérfano por doble ejecución (corrupción potencial P0 si se explota; clasado P1 por latencia — 0 ítems hoy).
- **ROOT CAUSE**: camino v1 nunca revocado tras la migración al family register_reception/confirm_pending_reception.
- **AFFECTED**: RPC `public.receive_purchase(uuid)`; tablas inventory/stock_movements/purchase_orders; tabla `purchase_items`.
- **REMEDIATION (propuesta)**: `REVOKE EXECUTE … FROM authenticated` + marcar deprecated/eliminar.
- **REGRESSION TEST**: contrato: authenticated NO puede ejecutar receive_purchase; doble llamada a flujo vigente → 1 solo efecto.

## F-02 · P1 · Devoluciones fantasma en producción (documentos sin ledger)

- **PRECONDITION**: ninguna (residencia de datos).
- **EVIDENCE** (08-returns/d1,d2; 13-accounting/r17): 13 devoluciones en TIENDA CENTRAL COSTPRO (12 `completed`, 1 `reversed`) **sin ningún stock_movement ni kardex ni payment** asociado. Destaca `NC-000008-2026`: 999 u × 350 = **349,650 CUP**, reason `Hot dev qty test 1786058955` (era de hot-tests ago-2026). `original_transaction_id=NULL` en ambas sospechosas.
- **EXPECTED**: toda devolución `completed` deja movimiento `return` (DF-01 A1) y, si procede, pago.
- **ACTUAL**: documentos de crédito falsos por **353,850 CUP** acumulados (349,650 + 12×350). Inventario NO afectado (r01 global consistente).
- **CLASSIFY**: REAL (integridad documental) + LEGACY (era HOT); no corrupción de stock ni de caja.
- **ROOT CAUSE**: `create_devolution` overload v1[0] no crea movimientos (hace `UPDATE products SET stock_current=stock_current+qty` transitorio + kardex directo) — los docs sobrevivieron; las huellas de stock/kardex ya no (limpiezas posteriores).
- **AFFECTED**: tabla `devolutions`/`devolution_items` (datos); RPC v1 `create_devolution[0]` (aún vivo, grant postgres/service_role).
- **REMEDIATION (propuesta, requiere decisión humana)**: anular (`voided`) los 12 docs sin respaldo + retener NC-000008 como caso documentado; opcionalmente auditoría de NC emitidas a clientes.
- **REGRESSION TEST**: invariante: toda devolution `completed` tiene ≥1 movimiento `return` vinculado.

## F-03 · P1 · COGS hueco heredado (stock inicial sin base de costo)

- **EVIDENCE** (r15; r14b; e8): 496/615 movimientos `sale` con `unit_cost=0`; 514/633 `transaction_items.cost_at_sale=0`; 496 kardex entries a costo 0 en tiendas de producción; `wac_change_log` sin ningún evento `initial` (98 movimientos `initial` +6,427 u nunca recalcularon WAC).
- **EXPECTED**: costo de venta = WAC vigente; valor kardex ≠ 0.
- **ACTUAL**: salidas valoradas a 0 → margen/ROI/kardex vacíos para el stock heredado.
- **CLASSIFY**: LEGACY (seed sin costo), activo en reportes; el mecanismo actual (reception/production/transfer recalculan — E8: 119 eventos WAC desde 2026-09-05) es correcto.
- **BUSINESS IMPACT**: informes de rentabilidad inválidos para stock heredado; no afecta cantidades ni saldos.
- **ROOT CAUSE**: `process_initial_stock` y seed crean existencias sin costo; productos con `cost_average=0` vendidos antes de la primera recepción con WAC.
- **AFFECTED**: `stock_movements.unit_cost`, `transaction_items.cost_at_sale`, `kardex_entries.total_value`; RPC `process_initial_stock`.
- **REMEDIATION (propuesta)**: decidir política de costo base (captura de costo de apertura con evento WAC `initial` o aceptación documentada).
- **REGRESSION TEST**: contrato: venta sobre producto con cost_average>0 genera movimiento con unit_cost>0.

## F-04 · P2 · Trazabilidad documento↔ledger rota

`stock_movements.reference_id` es NULL en purchases (D3: 20/20) y producción (D5: referencia solo como texto embebido en `reference_doc`); kardex siempre referencia `stock_movement` (D4: 1,021/1,021). No es posible reconciliar documento↔movimiento por FK. Recuperable por heurística (store+producto+fecha). ROOT: `register_stock_movement` solo propaga `p_sale_id` como reference_id. REMEDIATION: poblar reference_id en recepciones/producción/transferencias. (03-reconciliation/d3,d4,d5)

## F-05 · P2 · Kardex `balance_quantity` en PRE-imagen sistemática

Semántica de cola de triggers: `trg_auto_kardex` (alfabético antes de `trg_sync_product_stock`) lee `products.stock_current` ANTES de aplicar el movimiento; el cascade inventory→stock_current (AFTER de inventory) encola al final del statement. Evidencia: últimas entradas difieren de inventory exactamente en el delta del último movimiento (e7: ENERVIDA 123: -1; PROD-010: +0.0048). El comentario de doctrina W62-01 ("kardex ve ca_new") solo se cumple para WAC, no para cantidad. REMEDIATION: recalcular balance dentro del trigger (usar NEW.balance_after) o reordenar. (03-reconciliation/e7)

## F-06 · P2 · EXECUTE a PUBLIC en 4 RPCs mutativos

`register_reception`, `reverse_receipt_v2`, `void_transaction`, `create_sale_v2` tienen `=X/postgres` (PUBLIC). Todas fallan cerradas para anon (guards internos con auth.uid()), pero viola la doctrina least-privilege consolidada en REM-PO-1/REM-SEC-1. REMEDIATION: `REVOKE PUBLIC` + grants explícitos. (12-multistore/r13)

## F-07 · P2 · `fn_process_receipt[1]`: fallback de SKU cross-store

Si el SKU no existe en la tienda solicitada, toma `WHERE sku=v_sku LIMIT 1` de cualquier tienda y deja el documento en la tienda solicitada mientras el stock/WAC caen en la tienda del producto (mismatch doc-tienda ≠ stock-tienda). Mitigado: grant solo postgres/service_role. REMEDIATION: eliminar fallback + validar pertenencia. (05-receipts/e9)

## F-08 · P2 · Idempotencia DB ausente en transferencias/ajustes/recepciones

No hay `idempotency_key`/dedupe en `create_transfer`/`confirm_transfer`/`reverse_transfer`, `perform/confirm_inventory_adjustment`, `confirm_pending_reception`; dependen de guardas de estado + FOR UPDATE (bien) pero un retry de red puede crear documentos duplicados (dos transferencias en vez de una). La capa API tiene `src/lib/idempotency.ts` + `idempotency_keys` (solo algunas rutas). Los flujos críticos endurecidos SÍ la tienen: create_sale_v2, create_devolution_v2, receive_production_output, withdraw_v3, reverse_transaction_v2 (status-idempotente). REMEDIATION: extender patrón `idempotency_key` al resto.

## F-09 · P3 · Observabilidad kardex

`production_in/out` mapeados a kardex 'adjustment' (pierde semántica productiva); `reference_doc` genéricos ("Venta POS v2", "Recepción de mercancía") impiden trazabilidad por documento.

## F-10 · P3 · Código muerto / comentarios engañosos en `register_stock_movement`

`v_dist_costs` calculado y nunca usado (hotfix A2); comentario cita `trg_update_product_wac` que no existe en el catálogo live (el escritor real es fn_recalc_wac vía w62 guard).

## OBSERVATIONS

- **OBS-1**: 14 `received_services`, 0 prorrateos (`service_cost_distributions` vacía): feature viva sin uso real ni cobertura de prueba (Fase 5 sin hallazgos de duplicación/pérdida por ausencia de datos; distribución teórica verificada por lectura de `distribute_service_cost_v` — idempotente por DELETE+INSERT dentro de transacción).
- **OBS-2**: `build` = INFRASTRUCTURE BLOCKER (OOM exit 137 documentado en gates previos; host 4GB sin swap con dev server residente). No afecta al código auditado; idéntico a baseline REM-PO-1.
- **OBS-3**: Defensas live destacables: immutabilidad de inventory, no-negativos, single-writer WAC con log completo (`wac_change_log`), store-mismatch guard (H-01), transición de documentos validada (`fn_validate_document_transition` en receipts/transactions), protección de total_amount.

## RECOMMENDED REMEDIATION ORDER (tras decisión humana)

1. F-01 (REVOKE receive_purchase — 1 línea, elimina camino de corrupción).
2. F-02 (anulación de docs fantasma — decisión de negocio sobre 353,850 CUP).
3. F-06 (REVOKE PUBLIC ×4 — hardening consistente).
4. F-05 + F-04 (kardex balance + reference_id — calidad de auditoría interna).
5. F-03 (política de costo base — decisión contable).
6. F-07/F-08/F-09/F-10 (hardening incremental).
