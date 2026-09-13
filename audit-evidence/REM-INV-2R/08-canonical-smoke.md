# 08 — CANONICAL RECEPTION SMOKE EN STAGING (REM-INV-2R, fase 11)

Entorno: PostgreSQL 16.2 efímero (pgserver, datadir desechado al terminar).
Sin credenciales de producción, sin llamadas de red. Instalación VERBATIM desde prod:
receive_against_po · register_reception · confirm_pending_reception ·
has_store_access_as · has_store_access · is_admin · validate_operation_date ·
fn_recalc_wac · register_stock_movement + los 3 triggers de stock_movements
(tr_sync_inventory_after_movement BEFORE INSERT · trg_auto_kardex AFTER INSERT ·
trg_sync_product_stock AFTER INSERT — nombres idénticos ⇒ orden de disparo idéntico).
receive_purchase NO se instala (control negativo: to_regprocedure → NULL).

Propósito: SOLO demostrar que el DROP no afectó la ruta canónica (no se repite la batería
completa de REM-INV-2).

## Resultados (5/5 PASS)

| # | Escenario | Esperado | Resultado |
|---|---|---|---|
| S1 | Recepción válida (OC draft, 10/10, admin con acceso) | success + receipt + stock + WAC + audit | **PASS** |
| S2 | Segunda recepción sobre OC ya received | DENIED / terminal guard | **DENIED** — `ERR_PO_NOT_RECEIVABLE: status received is terminal` |
| S3 | Usuario sin acceso a la tienda de la OC | DENIED | **DENIED** — `ERR_UNAUTHORIZED` |
| S4 | Identidad anónima (auth.uid() NULL) | DENIED | **DENIED** — `ERR_UNAUTHORIZED` |
| S5 | OC cancelled | DENIED | **DENIED** — `ERR_PO_CANCELLED` |

## Detalle S1 — cadena canónica completa verificada post-DROP

| Verificación | Valor |
|---|---|
| receive_against_po retorno | `status=success, po_status=received, items_received=1` |
| receipts creada | active, store A, po_id vinculado (G6), total_cost=50.00 |
| receipt_items | 10 × unit_cost 5.00 |
| inventory (trigger) | 5 → **15**, version incrementada |
| stock_movements | type=purchase, +10, balance_after=**15** |
| products.stock_current (trigger) | **15** |
| WAC canónico | 100 → **36.666667** = (5·100 + 10·5)/(5+10) — blend W62-01/D-01 exacto |
| wac_change_log | 1 fila: reception_in, 100→36.667 |
| audit_logs | 2 filas: REGISTER_RECEPTION + po_received |
| kardex_entries (trigger) | 1 fila |
| business_events | 1 fila stock_movement |
| PO status | draft → **received** (10/10), received_at set |

## Incidente de fixture (documentado, no es defecto de producto)

Primera corrida FAIL en S1 por dos artefactos del fixture de prueba: (a) no se sembró la
fila inicial de `inventory` (stock 5) — los triggers funcionaron correctamente con lo que
había; (b) error aritmético en la expectativa WAC del propio harness (66.667 en vez de
550/15=36.667 — la BD aplicó el blend canónico correcto desde el primer momento).
Corregido el fixture, re-ejecutado desde datadir limpio → 5/5 PASS. El comportamiento del
producto fue idéntico y correcto en ambas corridas.

Raw: `assets/canonical-smoke.json`.
