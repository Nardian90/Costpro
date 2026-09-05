# W9.5 — B-8 · MODELO C · 02-authorization-map.md
# Mapa completo UI → hook → API/RPC → DB → autorización → mutación (post-implementación)
# fecha: 2026-09-05 · baseline: c57e8de1 + migración 20260905000001

## OPERACIÓN 1 — POS UNDO (Nivel 1)

```
POS checkout OK (usePOSCheckout.ts)
  └─ toast "Venta registrada" (30s) — SOLO SI canUndoSaleInStore(user, storeId)   [UI gate: src/lib/roles.ts]
       └─ click "Deshacer" → invertSale (useDocumentActions.ts useInvertDocument)
            └─ supabase.rpc('void_transaction', {p_transaction_id, p_reason, p_operation_date})   [cliente autenticado]
                 └─ void_transaction [SECURITY DEFINER, search_path pg_catalog,public]
                      1. SELECT … FOR UPDATE  (primera lectura relevante)
                      2. auth.uid() como actor (p_user_id ignorado salvo service_role)
                      3. has_store_access_as(actor, tx.store_id)   → STORE ACCESS
                      4. status='voided' → ERR_ALREADY_VOIDED ; status<>'completed' → ERR_INVALID_TRANSITION
                      5. can_pos_undo_transaction(tx, actor)        → OPERATION AUTHORIZATION
                         (ownership seller_id=actor ∧ age≤30s ∧ completed ∧ rol POS por membership o admin global)
                      6. UPDATE transactions → voided ; register_stock_movement(sale_void) ×items
                      7. audit_logs: VOID_SALE + metadata{operation:POS_UNDO, old_status, new_status, reason}
```

## OPERACIÓN 2 — REVERSIÓN ADMINISTRATIVA (Nivel 2)

```
SalesHistoryView.tsx
  └─ botón "Revertir venta" — visible SI canReverse(status) && canAdminReverseSaleInStore(user, store)  [UI gate]
       └─ ReverseDocumentModal (motivo obligatorio)
            └─ useReverseDocument → apiFetch POST /api/reverse {type:'transaction', id, reason}
                 └─ /api/reverse/route.ts
                      withAuth (JWT Supabase verificado) + validateOrigin + rateLimit(5/min)
                      └─ BOUNDARY (solo type='transaction'):
                           SELECT store_id (service_role)
                           rpc can_admin_reverse_transaction(p_actor=session.user.id, p_store_id)
                           false → 403 ERR_INSUFFICIENT_ROLE ; tx inexistente → 404
                      └─ supabase.rpc('reverse_transaction_v2', {p_transaction_id, p_reason, p_user_id=session.user.id})  [service_role]
                           └─ reverse_transaction_v2 [SECURITY DEFINER, search_path public,pg_temp]
                                1. SELECT … FOR UPDATE
                                2. status='voided' → idempotente ; <>completed → ERR_INVALID_STATUS
                                3. has_store_access_as (STORE ACCESS)
                                4. can_admin_reverse_transaction(actor, store)  → OPERATION AUTHORIZATION
                                   (admin global transversal ∨ membership activa admin/manager/encargado en ESA tienda)
                                5. register_stock_movement(sale_reverse) ×items ; UPDATE → voided
                                6. audit_logs: REVERSE_TRANSACTION_V2 + metadata{operation:ADMIN_REVERSE, old_status, new_status, units_restored, reason}
```

## INVARIANTE DE ÚNICA FUENTE

* `can_pos_undo_transaction` y `can_admin_reverse_transaction` son LA política.
* La API llama a la MISMA función DB (no reimplementa reglas) — sin divergencia posible.
* Los espejos UI (`canUndoSaleInStore`, `canAdminReverseSaleInStore` en src/lib/roles.ts)
  replican la semántica para conveniencia de render; la última barrera SIEMPRE es la DB.
* `ROLE_PERMISSIONS` expone `canUndoSales` (admin/manager/encargado/clerk) y
  `canReverseSales` (admin/manager/encargado); el flag ambiguo `canVoidTransactions`
  fue eliminado (y con él su gate muerto en useSalesHistoryView).

## ELIMINACIONES (divergencia)

* useSalesHistoryView: flujo void legacy muerto (handleRequestVoid/handleConfirmVoid/
  voidTarget/canVoid/useInvertDocument) — eliminado. Era un botón conceptual que
  visualmente sugería una restricción que el handler no respetaba.
* Doc previa 03-referencia/02-roles-permisos.md: banner de SUPERSEDADO (ventana 24h
  nunca implementada). Doc vigente: sección "Anulación y reversión de ventas (MODELO C)".

## FUERA DE ALCANCE B-8 (documentado)

* /api/reverse tipos ≠ transaction (receipt/transfer/adjustment/devolution/
  production_order) conservan política vigente → backlog B-10.
* Trigger preexistente `UPDATE_STATUS` (20240325000000) usa
  COALESCE(auth.uid(), NEW.seller_id): bajo service_role atribuye al seller de la
  fila. Comportamiento PREEXISTENTE, no alterado por esta migración; la atribución
  autoritativa vive en VOID_SALE / REVERSE_TRANSACTION_V2 (user_id = caller real).
