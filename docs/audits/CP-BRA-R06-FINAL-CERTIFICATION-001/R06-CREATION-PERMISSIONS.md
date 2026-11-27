# R-06 — PERMISOS DE CREACIÓN (implementación técnica)

## Estado previo (auditoría FASE 1)

TODAS las rutas de creación permitían la operación por mera membresía o admin de plataforma:

| Punto de entrada | Gate previo |
|---|---|
| RPC `register_reception` (cliente directo + `/api/inventory/receptions` + `/api/sync/batch`) | `has_store_access_as` (membresía cualquiera \| admin) |
| RPC `receive_against_po` (POST `/api/purchase-orders/[id]`) | `has_store_access` + ruta admin\|manager\|encargado\|warehouse |
| INSERT directo de borradores (`useSavePendingReception`, flujo del navegador) | RLS `receipts_insert_rls` (membresía cualquiera); `user_id` provenía del cliente |
| RLS `receipt_items_insert_isolated` | membresía cualquiera en la tienda de la recepción |

## Implementación

### Helper canónico (única fuente de verdad de creación)
`public.can_create_reception(p_user_id, p_store_id)` = `is_superadmin_uid(p_user_id)` **O** (membresía activa con `role='encargado'` exacto). NO usa `has_store_role_as` (esa da bypass a admin de plataforma — la decisión del propietario no concede creación por ser admin).

### Gates aplicados
1. `register_reception`: `ERR_FORBIDDEN_ROLE` si no `can_create_reception(v_caller_uid, p_store_id)`. El resto del cuerpo quedó **byte-idéntico** (extraído de `pg_get_functiondef` de la BD y reescrito con reemplazo exacto — verificado por el test de contrato y por los 14/14 unitarios).
2. `receive_against_po`: mismo gate con `auth.uid()` (recibir contra OC CREA una recepción; `register_reception` re-verifica en su propia barrera).
3. RLS `receipts_insert_rls`: `WITH CHECK (is_superadmin() OR membresía activa rol='encargado')`.
4. RLS `receipt_items_insert_isolated`: mismo permiso contra la tienda de la recepción cabecera.
5. Rutas: `POST /api/inventory/receptions` y `POST /api/purchase-orders/[id]` precisan `sessionCanCreateReception` (403 accionable `ERR_FORBIDDEN_ROLE`); la BD re-verifica.
6. UI: botones «Nueva»/«Express» solo para quien puede crear (aviso claro en caso contrario); `useReceptionState` rechaza el submit con mensaje de autorización.

### Identidad del creador (§2.1)
- `register_reception` ya asignaba el creador desde la identidad autenticada del servidor.
- El flujo de borradores del navegador insertaba `user_id` libremente → **trigger nuevo `receipts_pin_creator`**: INSERT de cliente autenticado fija `user_id := auth.uid()` (nunca el body); service_role conserva el provisto; UPDATE de `user_id` → `ERR_CREATOR_IMMUTABLE` para todos.
- Demostración: casos 12 (p_user_id ajeno ignorado), 13 (cambio de creador bloqueado, fila intacta).
