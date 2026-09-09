# 03 — ARCHITECTURE BEFORE

## Flujo ANTES de la remediación (roto)

```
ProductionOrdersView.tsx (UI)
  │  body: { item_id, qty, unit_cost }   ← costo escrito por el USUARIO en el cliente
  ▼
POST /api/production-orders/[id]/withdraw
  │  withAuth → session (NextAuth JWT)
  │  profiles.active_store_id → p_store_id
  │  supabase.rpc('withdraw_production_item', {
  │      p_item_id, p_qty, p_unit_cost: unit_cost || 0,   ← CLIENTE DETERMINA COSTO
  │      p_store_id, p_user_id, p_idempotency_key })
  ▼
RPC withdraw_production_item → NO EXISTE EN BD VIVA → HTTP 500 (PGRST202)
```

## Objetos del dominio (mapeo §6 de la directiva)

| Objeto | Estado vivo | Rol |
|---|---|---|
| `/api/production-orders/[id]/withdraw` | existe (roto) | endpoint HTTP real |
| `withdraw_production_item` (6 args) | NO existe | RPC histórica muerta |
| `withdraw_production_item_v3` (7 args) | existe, ACL `{postgres,service_role}` | RPC segura huérfana |
| `production_orders` | existe | órdenes (status, store_id, created_by) |
| `production_order_items` | existe | items (budgeted_qty, actual_qty, actual_unit_cost) |
| `production_order_withdrawals` | NO existe (referencia histórica sin aplicar) | — |
| `stock_movements` | existe | kardex (movement_type='production_out') |
| `products.cost_average` | existe | **WAC — fuente del costo server-side** |
| `idempotency_registry` | existe | registro oficial de idempotencia |
| `w62_zero_cost_flags` | existe | aprobación documentada de WAC=0 |
| `audit_logs` | existe | procedencia del costo (INV-15) |
| `check_idempotency` / `register_idempotency` | existen | helpers del registry |

## Contrato del frontend (sin tocar en esta corrida)

`ProductionOrdersView.tsx:603-607` envía `{ item_id, qty, unit_cost }`.
La remediación NO toca UI: el campo `unit_cost` seguirá siendo enviado por la
UI pero **el servidor lo ignorará por completo** (compatibilidad de contrato).
