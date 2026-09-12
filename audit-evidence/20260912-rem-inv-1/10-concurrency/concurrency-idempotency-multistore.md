# REM-INV-1 — 10 CONCURRENCIA (Fase 9) · 11 IDEMPOTENCIA (Fase 10) · 12 MULTI-STORE (Fase 11)

## Fase 9 — Concurrencia (análisis de código + locks live; sin pruebas mutativas sobre producción por §3)

Matriz de locks (generada de las definiciones live — ver 01-schema-map/e1,e5):

- **FOR UPDATE presente** (20 funciones): close_production_order_v2, confirm_inventory_adjustment, confirm_pending_reception, confirm_transfer, create_devolution_v2, create_sale_v2, create_transfer, fn_process_receipt ×2, fn_recalc_wac, perform_inventory_adjustment, receive_against_po, receive_production_output, reverse_devolution, reverse_production_order, reverse_receipt_v2, reverse_transaction_v2, reverse_transfer, void_closed_production_order, void_transaction, withdraw_production_item_v3.
- **Escritura de inventario** (fn_sync_inventory_on_movement): UPDATE …RETURNING con row-lock nativo + version++ + re-chequeo de negativo post-lock → sin lost-update identificable; reads-modify-write siempre en la fila de inventory (serialización por fila).
- **Sin lock**: create_devolution v1 (inalcanzable), receive_purchase (F-01 — agrava el hallazgo), reverse_receipt v1 (inalcanzable), process_initial_stock, reconcile_stock (lectura), deduct_stock/get_available_stock (helpers).
- Evidencia de carrera WAC: fn_recalc_wac bloquea products FOR UPDATE antes del blend; combinado con el row-lock de inventory, el orden WAC→movimiento (W62-01) es atómico por transacción.
- **No se ejecutaron pruebas de carga concurrentes sobre producción** (§3). Casos T1+T2 documentados como TEST GAP para harness Postgres local (infra disponible en workspace anterior; re-pendiente de reconstrucción tras el reset del workspace).

## Fase 10 — Idempotencia

- **DB-level con key explícita**: create_devolution_v2 (devolutions.idempotency_key), create_sale_v2, receive_production_output, withdraw_production_item_v3, close_production_order_v2/create_production_order_v2 (keys).
- **Status-idempotencia** (retry seguro por guarda de estado): reverse_transaction_v2 (voided→idempotent), confirm_pending_reception (pending-only), reverse_receipt_v2 (active-only), transfers/adjustments (status transitions validadas por fn_validate_document_transition).
- **Capa API**: src/lib/idempotency.ts + tablas idempotency_keys (request_path+payload_hash) e idempotency_registry (operation+record_id+param_hash) — cobertura parcial de rutas.
- **Gap (F-08)**: create_transfer/confirm/reverse, perform/confirm_inventory_adjustment sin key explícita → retry de red puede duplicar documentos (no saldos — el saldo solo cambia en confirm, que es status-guarded).
- same key + different payload / concurrente: gestionado por unique + FOR UPDATE en las rutas que tienen key; sin prueba de ejecución (§3).

## Fase 11 — Multi-tenant / Multi-store (enfoque económico)

- Patrón de identidad verificado en todas las rutas v2: `v_caller_uid := CASE WHEN auth.role()='service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END` — anti-spoofing consistente (REM-PO-1/REM-SEC-1) + `has_store_access_as(uid, store)` + validación documento-tienda (`ERR_CROSS_STORE` en devolution_v2) + guard H-01 en trigger (movement.store_id == products.store_id).
- **Contaminación económica cross-store**: NO detectada en datos (r01/r02/r11 globales por tienda sin divergencias; transfers 8/8 internas a fixtures). Riesgos residuales: F-07 (fallback SKU en fn_process_receipt[1], mitigado service_role-only) y F-01 (receive_purchase sin store check — mitigado por alcance PO/tienda del documento).
- API layer: withAuth + canManageStore + rate-limit en rutas económicas (verificado en /api/devolutions); p_store_id de body siempre re-validado contra membership.
- Grants: consolidado en 12-multistore/r13 (ver F-06: 4 PUBLIC).
