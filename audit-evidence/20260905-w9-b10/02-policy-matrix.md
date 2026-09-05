# W9.5 — B-10 · 02-policy-matrix.md
# ESPECIFICACIÓN DE POLÍTICA CONGELADA — 5 tipos restantes de /api/reverse
# fecha: 2026-09-05 · baseline: dd3f3276

## 0. PRINCIPIO

NO se copia MODELO C de ventas. Cada operación recibe la política que su
evidencia documenta (roles de su dominio + membresía activa en la tienda de la
entidad + admin global transversal `*`). STORE ACCESS (has_store_access_as,
intacto) ≠ OPERATION AUTHORIZATION (helper normativo nuevo).

## 1. EVIDENCIA POR TIPO (GATE 3/4)

### receipt (recepciones)
* Nav (sidebar.structure + useTerminalNavigation): admin, manager, encargado, warehouse.
* ROLE_PERMISSIONS.canReceiveProducts: admin, manager, encargado, warehouse.
* Doc vigente "Recepciones": admin/manager/encargado/warehouse ✅.
* → TRES fuentes coinciden. Mecánica RPC (reverse_receipt_v2): FOR UPDATE,
  fn_recalc_wac, stock_movements purchase_reverse, audit REVERSE_RECEIPT_V2,
  estado reversible ÚNICO 'active'. NOTA: su ACL tiene EXECUTE a
  authenticated+PUBLIC (superficie client-callable; el cuerpo fija identidad) —
  se conserva (patrón familia POS), la capa de rol nueva aplica igual.

### transfer (transferencias)
* Nav (ambos configs): admin, manager, encargado, warehouse. Doc vigente idéntico.
* RPC (reverse_transfer): exige acceso a ORIGEN y DESTINO (naturaleza
  bidireccional del documento), FOR UPDATE, WAC blend destino, 2 movimientos
  (transfer_in origen / transfer_out destino), audit 'transfer_reversed',
  estado reversible ÚNICO 'CONFIRMADA' (enum transfer_status).
* → El ROL se resuelve en la tienda ORIGEN (dueña del documento y del audit);
  el acceso al destino sigue siendo requisito ADICIONAL (sin cambio).

### adjustment (ajustes documentales)
* Nav sidebar.structure: admin, manager, encargado. Nav useTerminalNavigation:
  manager, admin, encargado. ⚠️ AMBOS navs EXCLUYEN warehouse.
* ROLE_PERMISSIONS.canAdjustStock: admin/manager/encargado/warehouse + doc
  vigente "Ajustes de inventario" incluye warehouse → CONTRADICCIÓN registrada
  (GATE 4). canAdjustStock NO tiene consumidores en componentes (bandera muerta
  para este flujo). La ÚNICA puerta al botón "Revertir ajuste" es la vista
  Ajustes Documentales → población real: admin/manager/encargado.
* ⚠️ HALLAZGO DE INTEGRIDAD (B-10-ADJ-1): el botón promete "invierte stock +
  kardex" (tooltip) y el hook documenta "invierte quantity_change" (V1
  reverse_adjustment realmente invertía: stock -= difference). El RPC activo
  (decisión B-11, v2.17.1) es duplicate_inventory_adjustment_v2, que RE-APLICA
  el MISMO delta (+diff) — duplica el efecto en vez de invertirlo. Tres fuentes
  independientes (tooltip, comentario del hook, V1) fijan el contrato como
  INVERSIÓN. → Se crea reverse_inventory_adjustment_v2 (inversión verdadera vía
  contra-documento con items esperado↔contado intercambiados + register_stock_
  movement(-diff) + FOR UPDATE + audit). El botón "Duplicar" conserva su propio
  flujo (duplicate_inventory_adjustment_v2 intacto).
* Estado reversible ÚNICO 'confirmed' (live: 5/5 confirmed).

### devolution (devoluciones)
* Módulo DORMANT: DevolutionsView NO tiene entrada en ningún nav (sidebar,
  useTerminalNavigation, MobileTabBar) ni enlace desde otras vistas; su creación
  (/api/devolutions → create_devolution_v2) solo se invoca desde la propia vista.
* Creación: has_store_access_as (membresía activa) — SIN rol. Docs: sin fila.
* → ÚNICA política registrada en el producto = membresía (simétrica a su
  creación). Se CONSERVA (C) y se documenta explícitamente. Hardening de
  integridad NO-controvertido (no cambia QUIÉN): FOR UPDATE + guard de estado
  ('completed' único reversible; live 12 completed / 1 reversed) + audit_logs
  REVERSE_DEVOLUTION (hoy la operación NO deja audit — GATE J).
* Mecánica (UPDATE directo de stock + kardex directo, sin stock_movements) se
  registra como BACKLOG B-10b (modernización) — NO se refactoriza aquí (§31).

### production_order (órdenes de producción)
* Puerta UI ÚNICA: submenu 'costo' → allowedRoles [admin, manager, costo]
  (FIX-PRODUCTION 2026-07-12 las movió al módulo Costo). Sin entrada en el
  segundo nav. Docs: sin fila. API /api/production-orders: withAuth + rate
  limit (sin rol).
* RPC (reverse_production_order): FOR UPDATE, fn_recalc_wac, stock_movements
  production_reverse, audit PRODUCTION_ORDER_REVERSED, estado reversible ÚNICO
  'closed' (el botón UI lo ofrece también para in_progress/paused/completed →
  la DB responde ERR_ORDER_NOT_CLOSED: divergencia UI-más-ancha-que-DB, dirección
  segura; el gate de UI nuevo además oculta el botón sin rol).
* → Se congela la población de su puerta real: admin/manager/costo (membresía).
  OBSERVACIÓN de producto registrada: operación que muta inventario vive bajo
  el módulo Costo y 'costo' (rol analítico "sin acceso a inventario" según
  docs) participa — decisión de producto preexistente (FIX-PRODUCTION), no
  alterada por B-10.

## 2. MATRIZ CONGELADA (sin celdas ambiguas)

Rol de membership en la TIENDA DE LA ENTIDAD; `*` = admin global (profiles.role)
transversal en todas las tiendas (doctrina roles.ts, confirmada B-8/B-2).

| Operación        | Rol (membership)                    | Propia | Ajena | Same store | Cross store | Ventana | Estado reversible |
|------------------|-------------------------------------|-------:|------:|-----------:|------------:|---------|-------------------|
| receipt          | admin, manager, encargado, warehouse | N/A | N/A | ✓ | ✗ (salvo *) | sin | active |
| transfer         | admin, manager, encargado, warehouse (ORIGEN) + acceso DESTINO | N/A | N/A | ✓ (ambas) | solo con acceso a ambas | sin | CONFIRMADA |
| adjustment       | admin, manager, encargado            | N/A | N/A | ✓ | ✗ (salvo *) | sin | confirmed |
| devolution       | cualquier membresía ACTIVA (como su creación) | N/A | N/A | ✓ | ✗ (salvo *) | sin | completed |
| production_order | admin, manager, costo                | N/A | N/A | ✓ | ✗ (salvo *) | sin | closed |
| transaction (B-8)| admin/manager/encargado (admin-reverse); POS-undo: +clerk, propia ≤30s | POS: SÍ / admin: N/A | POS: ✗ / admin: ✓ | ✓ | ✗ (salvo *) | POS 30s / admin sin | completed |

Denegados en TODAS las reversiones: usuario, costo (salvo production_order),
y cualquier usuario sin membresía activa en la tienda de la entidad (salvo admin global).

"Propia/Ajena" = N/A: estos documentos no tienen vendedor; la creación es por
membresía y la reversión opera sobre el documento, no sobre la persona.

## 3. IMPLEMENTACIÓN NORMATIVA (GATE 10 — sin 6 helpers clónicos)

UNA función normativa parametrizada con la política interna (fuente única):

```
can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text) → boolean
  'receipt'         → membership ∈ (admin, manager, encargado, warehouse)
  'transfer'        → membership ∈ (admin, manager, encargado, warehouse)   [en ORIGEN]
  'adjustment'      → membership ∈ (admin, manager, encargado)
  'devolution'      → membresía ACTIVA (sin rol — política heredada de creación)
  'production_order'→ membership ∈ (admin, manager, costo)
  admin global → true (transversal *); sin membresía activa → false
```

* Los RPC llaman al helper con SU constante de operación (el cliente no puede
  influir en el parámetro).
* El API boundary llama al MISMO helper por tipo (map por entidad).
* Espejo UI: canReverseDocumentInStore(user, storeId, type) en lib/roles.ts.

## 4. CANAL Y AUDITORÍA POR OPERACIÓN

| type | Canal UI | RPC (V2 map) | audit action (se conserva) | metadata.operation (nuevo, aditivo) |
|---|---|---|---|---|
| receipt | Recepciones → "Revertir" | reverse_receipt_v2 | REVERSE_RECEIPT_V2 | ADMIN_REVERSE_RECEIPT |
| transfer | Transferencias (salientes) → "Revertir" | reverse_transfer | transfer_reversed | ADMIN_REVERSE_TRANSFER |
| adjustment | Ajustes Doc. → "Revertir" | **reverse_inventory_adjustment_v2 (NUEVA)** | REVERSE_ADJUSTMENT_V2 | ADMIN_REVERSE_ADJUSTMENT |
| devolution | (vista huérfana — sin puerta) | reverse_devolution | REVERSE_DEVOLUTION (NUEVO) | ADMIN_REVERSE_DEVOLUTION |
| production_order | Costo → Producción → "Revertir" | reverse_production_order | PRODUCTION_ORDER_REVERSED | ADMIN_REVERSE_PRODUCTION_ORDER |
| transaction | Historial → "Revertir" | reverse_transaction_v2 | REVERSE_TRANSACTION_V2 | ADMIN_REVERSE (B-8) |

## 5. CLASIFICACIÓN POR OPERACIÓN (§8)

| type | Clase | Justificación |
|---|---|---|
| receipt | **B — MODELO C ADAPTADO** | roles del dominio recepción + membresía; mecanismo RPC ya correcto |
| transfer | **B — MODELO C ADAPTADO** | roles del dominio transferencias en origen + acceso dual; mecanismo correcto |
| adjustment | **B — MODELO C ADAPTADO + FIX B-10-ADJ-1** | roles de la puerta real; se repara la dirección de la mutación (inversión, no duplicación) |
| devolution | **C — CONSERVAR + hardening** | única política registrada = membresía (como su creación); módulo dormant; hardening audit/FOR UPDATE/estado sin cambiar QUIÉN |
| production_order | **B — MODELO C ADAPTADO** | roles de la puerta real (Costo: admin/manager/costo); mecanismo correcto |
