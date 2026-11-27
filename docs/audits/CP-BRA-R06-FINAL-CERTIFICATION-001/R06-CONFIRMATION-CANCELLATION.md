# R-06 — CONFIRMACIÓN Y ANULACIÓN (implementación técnica)

## Estado previo (auditoría)

| Operación | Gate previo |
|---|---|
| `confirm_pending_reception` | `has_store_access_as` (membresía cualquiera \| admin) — sin gate de creador |
| `void_pending_reception` | `has_store_access_as` |
| `reverse_receipt_v2` (anulación de confirmada) | `has_store_access_as` + `can_reverse_document` (rol admin/manager/encargado/warehouse) |
| `delete_pending_reception` / `save_pending_reception_changes` / `add_reception_items` / `update_reception_items` / `update_receipt_item_tasa` | `has_store_access_as` |
| RLS UPDATE/DELETE directo | membresía cualquiera / is_admin |

Cualquier miembro podía confirmar/anular recepciones ajenas — la brecha R-06 del catálogo (PUR-001 «cualquier miembro de tienda confirma/void sin gate de rol ni segundo aprobador»).

## Implementación

### Helper canónico
`public.can_manage_reception(p_actor, p_creator, p_store_id)` = `is_superadmin_uid(p_actor)` **O** (actor = creador **Y** membresía activa en la tienda propietaria). Creador no verificable (NULL/centinela `00000000-…`) → solo superadmin (§0.5). Sin exigencia de rol encargado sobre recepción propia (§0.2 explícito).

### Gates sustituidos (cuerpos byte-idénticos salvo el gate)
`confirm_pending_reception`, `void_pending_reception`, `reverse_receipt_v2` (sustituye los DOS gates anteriores), `delete_pending_reception`, `save_pending_reception_changes`, `add_reception_items`, `update_reception_items`, `update_receipt_item_tasa` (el SELECT añade `r.user_id AS receipt_creator` para el gate).

### RLS de tabla
- `receipts_update_rls`: `USING/WITH CHECK (is_superadmin() OR user_id = auth.uid())` — un miembro/admin ya NO puede virar `status` directamente: confirmación/anulación pasan EXCLUSIVAMENTE por los RPC con gate. `receipts_tenant_update` retirada.
- `receipts_delete_rls`: creador|superadmin **Y** status='pending' (rollback del flujo de borradores).

### Rutas y UI
- `PATCH /api/inventory/receptions/[id]` y `PATCH .../items/[itemId]`: precisan creador|superadmin (403 accionable); los RPC re-verifican.
- UI: Confirmar/Anular/Editar/Revertir/Eliminar solo para el creador (o superadmin); nota de contexto de tienda cuando actúa el superadmin.

### Guards financieros intactos (§0.4)
Máquina de estados (`ERR_RECEIPT_ALREADY_CONFIRMED`, `ERR_INVALID_STATUS`, trigger `trg_validate_receipt_transition`), guard de pagos vivos (`ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS`), WAC primero → movimiento después, reversión previa, idempotencia de `void` (already voided), `FOR UPDATE` (concurrencia). Demostrados por los casos 28-37 de la batería.

### Concurrencia e idempotencia (demostrada)
- Confirmación concurrente (creador + superadmin en paralelo): exactamente 1 gana, 1 único movimiento por línea (caso 28).
- Anulación concurrente: 1 «success», la otra «idempotent» sin efectos (caso 29).
- Reintento: `ERR_RECEIPT_ALREADY_CONFIRMED` / void idempotente (caso 30/33/36).
