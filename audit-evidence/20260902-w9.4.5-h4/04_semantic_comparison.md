# W9.4.5 — H-4 | FASE 4 — MATRIZ SEMÁNTICA (efecto funcional, no texto)

| Comportamiento | Viva (W7 S2.6) | Canónica H-4 (reconciliada) | PR-4 (repo, obsoleta) | Impacto |
|---|---|---|---|---|
| auth.uid / caller guard | AUSENTE | v_caller_uid service_role-aware; no-service_role fijado a auth.uid() | v_caller_uid presente | Viva: falsificación de autoría posible → P1 |
| tenant/store authorization | AUSENTE | has_store_access_as(v_caller_uid, store) → ERR_UNAUTHORIZED | presente | Viva: reversión cross-store posible → P1 |
| payment reset | AUSENTE | receipts.payment_status='unpaid', paid_amount=0, paid_at=NULL + notes en payment_transactions + conteo | presente (mismo patrón que void_pending_reception) | Viva: receipts activas revertidas quedaban 'paid' → inconsistencia contable |
| stock movement | INSERT directo stock_movements | idéntico (INSERT directo) | vía register_stock_movement | Equivalente: triggers trg_auto_kardex/fn_sync_inventory actúan igual sobre el ledger |
| kardex | vía trg_auto_kardex | idéntico | kardex directo eliminado en PR-4; trigger genera | Equivalente |
| WAC | fn_recalc_wac SOLO si new_stock>0 (clamp salta el recálculo) | fn_recalc_wac SIEMPRE (inversa exacta; RAISE ERR_WAC_REVERSE_NEGATIVE_STOCK si S+q≤0) | WAC inline (hoy IMPOSIBLE: trg_guard_wac_writer lo rechazaría con ERR_WAC_SINGLE_WRITER_VIOLATION) | Viva: silencia inconsistencias; canónica detecta (prioridad INTEGRIDAD) |
| GREATEST(0) | SÍ (clamp) | NO | NO (RAISE ERR_INSUFFICIENT_STOCK) | Clamp = corrección de stock fantasma + WAC sin corregir |
| locking | FOR UPDATE receipts+products | idéntico | FOR UPDATE | Igual |
| currency | unit_cost × COALESCE(tasa,1.0) | idéntico | unit_cost × tasa (NULLUnsafe) | Canónica conserva mejora NULL-safe de W7 |
| audit action | 'RECEIPT_REVERSED_V2' (0 filas históricas) | 'REVERSE_RECEIPT_V2' (unifica 36 filas históricas + contrato B-12) | 'REVERSE_RECEIPT_V2' | Unificación de huella para consultas/reports |
| error handling | ERR_RECEIPT_NOT_FOUND / ERR_RECEIPT_NOT_ACTIVE | idénticos + ERR_UNAUTHORIZED + ERR_WAC_REVERSE_NEGATIVE_STOCK (mapa ruta: 404/403/500) | ERR_INVALID_STATUS | Sin regresión de contrato; 403 nuevo en caso no-autorizado |
| transaction handling | implícita (RPC) | idéntico | idéntico | Igual |
| idempotencia | guard status<>'active' | idéntico (más estricto: ERR_RECEIPT_NOT_ACTIVE) | devuelve 'idempotent' para voided | Canónica mantiene semántica viva |
| identity en audit fields | p_user_id (falsificable) | v_caller_uid (real) | v_caller_uid | P1 resuelto |
| return JSON | {status, receipt_id, items_processed} | idéntico + 'payments_reversed' (aditivo) | {status, receipt_id, payments_reversed} | Consumidores: route devuelve el JSON tal cual; hook no depende de claves añadidas |
| search_path | 'public, extensions' | 'public, pg_temp' (H-1: explícito, temp último) | 'public, pg_temp' | Cuerpo no usa objetos de extensions → sin cambio funcional |
