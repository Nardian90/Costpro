# W9.4.9 — H5-B3 — GATE 2: TRAZABILIDAD COMPLETA DE REVERSAL

Fecha: 2026-09-04 | Baseline: git 3d03afbc | Método: `rg` sobre src/supabase/e2e/tests + introspección pg_proc/pg_trigger live

## 1. Cadena canónica V2 (ruta primaria de reversión de ventas)

```text
UI ReverseDocumentModal.tsx (src/components/ui/ReverseDocumentModal.tsx)
 ↓ useReverseDocument() — src/hooks/api/useReverseDocument.ts (useMutation; sin mutación local previa)
 ↓ POST /api/reverse  (src/app/api/reverse/route.ts)
    ├ validateOrigin (CSRF)
    ├ rateLimit 5/min por usuario (no elimina concurrencia, solo la acota)
    ├ withAuth (sesión NextAuth)
    ├ FEATURES.USE_V2_REVERSE=true → RPC_MAP_V2   [flag en .env: NEXT_PUBLIC_USE_V2_REVERSE=true]
    ↓ supabase.rpc('reverse_transaction_v2', {p_transaction_id, p_reason, p_user_id: session.user.id})
       ↑ cliente supabase ADMIN (service_role, servidor) — src/lib/supabase-admin
 ↓ RPC reverse_transaction_v2 (OID 138188, SECURITY DEFINER, search_path=public,pg_temp)
 ↓ SELECT … FROM transactions WHERE id=… FOR UPDATE   ← LOCK INICIAL
 ↓ validación status + has_store_access_as
 ↓ loop transaction_items → register_stock_movement (movement_type='sale_reverse')
 ↓ UPDATE transactions SET status='voided'
 ↓ INSERT audit_logs ('REVERSE_TRANSACTION_V2')
```

## 2. Cadena legacy VIVA (segunda ruta ejecutable hacia el MISMO registro)

```text
UI POS checkout — botón "Deshacer" (30 s) usePOSCheckout.ts:316
   ó UI SalesHistoryView — flujo void useSalesHistoryView.ts (canVoid por ROLE_PERMISSIONS)
 ↓ useInvertDocument() — src/hooks/api/useDocumentActions.ts:74
 ↓ ⚠ supabase.rpc('void_transaction', …) DIRECTO DESDE EL NAVEGADOR (cliente anon/authenticated)
     (no pasa por /api/reverse ni por rate-limit de servidor; sí pasa por RLS/EXECUTE de PostgREST)
 ↓ RPC void_transaction (OID 138000, SECURITY DEFINER, EXECUTE: PUBLIC+authenticated+service_role)
 ↓ SELECT … FROM transactions WHERE id=… FOR UPDATE   ← LOCK INICIAL (también lo tiene)
 ↓ UPDATE transactions SET status='voided'
 ↓ loop transaction_items → register_stock_movement (movement_type='sale_void')
 ↓ INSERT audit_logs ('VOID_SALE')
```

**Conclusión de rutas**: existen DOS rutas ejecutables vivas que anulan la misma fila de
`transactions`. Ambas adquieren `FOR UPDATE` sobre esa fila como PRIMERA sentencia del
cuerpo RPC, por lo que la serialización entre rutas está garantizada a nivel de lock de fila
(la segunda sesión re-lee la fila al adquirir el lock y ve `status='voided'`).

Notas de reachability:
- RPC_MAP_V1.transaction TAMBIÉN resuelve a reverse_transaction_v2 (H5-B1): ningún camino
  de ejecución alcanza la V1 de transacciones (la función ni siquiera existe).
- RPC_MAP_V1.receipt resuelve a reverse_receipt (V1) — solo alcanzable si USE_V2_REVERSE=false.
  En este despliegue el flag es true → la ruta activa de receipts usa reverse_receipt_v2.

## 3. Rutas muertas / retiradas confirmadas

- `reverse_transaction` V1: AUSENTE en pg_proc live (0 filas). Migración de retiro:
  `20260903030000_w9_h5b1_retire_reverse_transaction_v1.sql`. Sin consumidores en src/.
- `void_transaction` referenciado en supabase-traced.ts:44 (solo mapeo de trazabilidad).
- Test `iteration-11-3.test.ts:98-100` aún exige que un SQL histórico NO haga DROP de V1:
  constraint de test obsoleto respecto a H5-B1 (aplica a archivos concretos, no a runtime).
  Sin efecto en la cadena viva.

## 4. Todas las rutas actuales que pueden anular/revertir/mutar una transacción (inventario live)

Funciones live que mutan `transactions` (query pg_proc contra cuerpos reales, ver
w9h5b3_q4_mutators.sql):

| función | muta transactions | muta payment_transactions | stock | FOR UPDATE |
|---|---|---|---|---|
| reverse_transaction_v2 | status→voided | NO | sí (sale_reverse) | **SÍ** |
| void_transaction | status→voided | NO | sí (sale_void) | **SÍ** |
| adjust_sale_payment | sí (montos/pagos) | NO* | no | **SÍ** |
| adjust_total_amount | sí (total) | NO* | no | **SÍ** |
| update_transaction_taxes | sí (impuestos) | NO | no | no ⚠ |

\* mutan `transactions` (cash_amount/transfer_amount/etc.), no la tabla payment_transactions.
⚠ `update_transaction_taxes` carece de FOR UPDATE — muta impuestos, no estado de reversión.
   Fuera del alcance H5-B3 (no crea doble reversión). REGISTRADO COMO BACKLOG informativo.

Funciones live que anulan/revierten OTROS documentos (no transactions): reverse_receipt (V1),
reverse_receipt_v2, reverse_transfer, reverse_adjustment, reverse_devolution,
reverse_production_order, void_pending_reception, void_reception_with_reversal,
void_received_service_with_reversal, void_closed_production_order, void_inventory_adjustment,
cancel_reception, cancel_transfer, fn_void_receipt, reverse_vale_salida — cada una opera sobre
SU documento; ninguna muta `transactions`.

`restore_transaction_snapshot` (OID 142222): herramienta de recuperación service_role-only con
pg_advisory_xact_lock(store) + precondition "la fila NO debe existir"; no es ruta de anulación.
Fuera de alcance.

## 5. Cadena de efectos sobre stock/WAC/kardex (común a ambas rutas)

```text
register_stock_movement (OID 133204)
 ↓ INSERT stock_movements (…RETURNING balance_after)
    ├ BEFORE INSERT trigger fn_sync_inventory_on_movement:
    │    UPDATE inventory SET quantity = quantity + Δ … RETURNING quantity  ← LOCK de fila inventory
    │    NEW.balance_after := quantity resultante
    ├ AFTER INSERT trigger sync_product_stock:
    │    UPDATE products SET stock_current = (último balance_after del producto)
    └ AFTER INSERT trigger auto_kardex_on_stock_movement:
         INSERT kardex_entries (movement_type sale_reverse/sale_void→'sale_reverse'/'out')
 ↓ UPDATE products SET stock_current = v_new_qty (register_stock_movement, redundante pero consistente)
```

WAC: la ruta sale_reverse/sale_void NO toca `cost_average` (A2 hotfix v2.22.0 — la actualización
de WAC vive en trg_update_product_wac sobre receipt_items y en fn_recalc_wac para recepciones).
`reverse_transaction_v2`/`void_transaction` NO invocan fn_recalc_wac → **no hay inversión WAC en
reversión de ventas**; el "double WAC reversal" del modelo de amenaza no aplica a esta cadena
(ver 07-wac-inventory-test.md para verificación empírica).

## 6. Semáforo de estado (trigger trg_validate_tx_transition, EN VIVO)

```text
transactions: pending    → [completed, voided]
              completed  → [voided, reversed]
              voided     → []  (TERMINAL — ni void ni reverse pueden salir de aquí)
              reversed   → []
```
El trigger corre en cada UPDATE de transactions (tgenabled='O') — segunda barrera de
defensa independiente del RPC.

## 7. HALLAZGOS COLATERALES (registro BACKLOG — NO corregir en H5-B3)

| # | Hallazgo | Clase | Riesgo actual |
|---|---|---|---|
| B-1 | `reverse_receipt` V1 sigue viva en BD (OID 136654), sin FOR UPDATE, sin guard atómico de status; solo EXECUTE postgres+service_role; sin consumidores con USE_V2_REVERSE=true | superficie latente | bajo (inerte mientras el flag sea true y nadie la llame por SQL) |
| B-2 | `void_transaction` EXECUTE concedido a PUBLIC+authenticated: usuarios autenticados pueden llamar el RPC directo saltándose rate-limit y permisos UI (`canVoidTransactions` solo se aplica en el cliente); la autorización intra-RPC (store access) SÍ aplica | exposición de superficie / privilegios UI-vs-RPC | medio — no es bypass cross-store ni de identidad, pero el permiso de rol `canVoidTransactions` NO se evalúa server-side |
| B-3 | `update_transaction_taxes` sin FOR UPDATE sobre transactions | concurrencia menor (impuestos) | bajo |
| B-4 | `sync_product_stock` calcula stock_current con `ORDER BY movement_date DESC, created_at DESC LIMIT 1` — empates de timestamp en movimientos concurrentes de transacciones DISTINTAS podrían elegir balance_after ambiguo | concurrencia inter-transacción | bajo-teórico (fuera del alcance H5-B3: no afecta la reversión única de UNA transacción) |
| B-5 | Test obsoleto `iteration-11-3.test.ts:98` (espera que V1 NO se dropee) | higiene de tests | nulo runtime |

Todos quedan REGISTRADOS aquí como BACKLOG; ninguno se corrige en este checkpoint (scope control §23).
