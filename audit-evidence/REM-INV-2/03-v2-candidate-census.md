# REM-INV-2 — 03: CENSO DE CANDIDATAS V2/CANÓNICAS DE RECEPCIÓN

**Pregunta central del gate**: ¿existe actualmente en CostPro una ruta V2/canónica de RECEPCIÓN DE COMPRAS que pueda sustituir de forma segura a `receive_purchase`?

**Regla aplicada**: una función solo califica si demuestra semánticamente que **recibe una compra y convierte el documento en inventario** (stock + costo/WAC + estado del documento + audit). Nombres `_v2`, cercanía de módulo u operaciones relacionadas NO bastan.

## 1. Descarte previo — candidatas que NO son recepción de compras

| Candidata descartada | Por qué NO es recepción de compras |
|---|---|
| `create_sale_v2` | Ejecuta checkout/venta (descuenta stock); operación inversa |
| `reverse_receipt_v2` | Reversión de una receipt ya efectuada |
| `reverse_inventory_adjustment_v2` | Reversión de ajuste de inventario |
| `reverse_adjustment` (V1) | Reversión de ajuste (V1) |
| `/api/reverse` | Endpoint de reversión, no de recepción |
| `void_transaction` / `void_reception_with_reversal` / `void_pending_reception` | Anulan/revierten; no incrementan inventario |
| `receive_production_output` (+ `_deprecated_4arg`) | Produce salida de producción hacia inventario (orden de producción), no compra |
| `receive_to_warehouse` | Recibe producto a almacén con lote (flujo de lotes, ACL service_role), no recepción de compra de proveedor |
| `create_received_service_v2` / `received_services` | Servicios recibidos (CxP de servicios), no inventario |
| `update_reception_items` | Edita items de una receipt ya creada (no crea recepción) |
| `cancel_reception` | Cancela |
| `get_products_for_reception` / `get_purchases_book` | Lectura (reportes/lookup), no mutación |

## 2. Matriz de candidatas VÁLIDAS (cadena canónica vigente)

| Candidata | ¿Recibe compra? | ¿Genera stock? | ¿Actualiza WAC? | ¿Audita? | ¿Idempotencia? | ¿Store guard? | ¿Caller activo? |
|---|---|---|---|---|---|---|---|
| **`register_reception`** (SECURITY DEFINER, v2.23.0) | SÍ (crea receipts + items; p_po_id opcional) | SÍ — via `fn_recalc_wac` + kardex | SÍ — `fn_recalc_wac('reception_in')` (doctrina W62-01: WAC primero → movimiento después) | SÍ — receipts.user_id, stock_movements.created_by; trigger `trg_check_reception_cost_variation` | SÍ — receipt status + validaciones B2-B5 (unit_cost>0, items no vacíos) | SÍ — `has_store_access_as(auth.uid(), p_store_id)` + producto-en-store (B5) | SÍ — UI directa + offline replay + endpoint sync |
| **`receive_against_po`** (SECURITY DEFINER, v2.24.0) | SÍ — flujo específico contra OC (`purchase_order_items`) | SÍ — delega en `register_reception` | SÍ — heredado de register_reception | SÍ — `audit_logs 'po_received'` + metadata + receipt vinculado por `po_id` | SÍ — guard de estado OC (`draft/sent/partial` únicamente) + `ERR_OVER_RECEIVE` por item + `FOR UPDATE` | SÍ — `has_store_access(v_store_id)` + producto-en-store | SÍ — `POST /api/purchase-orders/[id]` ← `useReceiveAgainstPO` (UI) |
| **`confirm_pending_reception`** (SECURITY DEFINER) | SÍ — confirma recepción `pending` → inventario | SÍ — stock_movements por item | SÍ — `fn_recalc_wac('reception_in')` | SÍ — stock_movements.created_by; total recalculado server-side | SÍ — `status <> 'pending' → ERR_RECEIPT_ALREADY_CONFIRMED` + `FOR UPDATE` | SÍ — `has_store_access_as` sobre store del receipt | SÍ — `useConfirmPendingReception` |

### Cadena demostrada (flujo canónico completo)

```text
purchase_orders + purchase_order_items      (OC vigente)
      ↓  useReceiveAgainstPO → POST /api/purchase-orders/[id]
receive_against_po      [FOR UPDATE, has_store_access, guard draft/sent/partial, over-receive]
      ↓  delega (8 validaciones B1-B5 + C1-C3)
register_reception      [auth.uid(), has_store_access_as, validaciones, receipt + receipt_items]
      ↓  WAC primero → movimiento después (W62-01 §6)
fn_recalc_wac  →  inventory (costo promedio)  +  stock_movements (kardex, con unit_cost/created_by)
      ↓
audit_logs ('po_received')  +  receipts.payment_status='unpaid' (CxP, G6)
```

Recepción sin OC: `register_reception` directamente (o vía cola offline → `/api/sync/batch` → misma RPC). Recepción pendiente: insert `pending` + `confirm_pending_reception`. Anulación: `void_reception_with_reversal`. El ciclo de vida completo existe y está conectado a UI, offline-replay y CxP.

## 3. Comparación con `receive_purchase` V1

La V1 queda **totalmente subsumida**: todo lo que `receive_purchase` hacía (incrementar stock + movimiento + marcar OC `received`) lo hace `receive_against_po → register_reception` con las guardas que a la V1 le faltan (ver 14-v1-v2-comparison.md para la matriz de 16 controles). Los datos lo confirman: 4 receipts vinculadas por `po_id` en prod (recepciones contra OC reales) y **0** movimientos de stock con `reference_id` de OC (la V1 nunca corrió contra datos reales).

## 4. Respuesta a la pregunta central

**SÍ EXISTE una ruta V2/canónica de recepción de compras**, no denominada `*_v2` en su eje principal sino consolidada como la familia `register_reception` / `receive_against_po` / `confirm_pending_reception` (hardening v2.23.0–v2.24.0), con callers UI activos, replay offline y trazas en producción (63 receipts). Es ESCENARIO B del protocolo (equivalente canónico), con evidencia concluyente: definiciones de prod + interceptación dinámica de los 3 handlers reales (05-dynamic-reachability.md).

**Declaración exigida por el protocolo**: `NEXT_PUBLIC_USE_V2_REVERSE=true` NO constituye evidencia de que exista Purchase Reception V2. La existencia de la ruta canónica de recepción se demostró independientemente de las flags de checkout/reversión, mediante definiciones de DB, callers de código y ejecución real interceptada.
