# 07 — RPC SECURITY (ACL, DEFINER, y superficie expuesta)

## Superficie expuesta después de la remediación

| Vector | Antes | Después | Control |
|---|---|---|---|
| anon → HTTP route | 401 (withAuth) | 401 (withAuth) — **verificado P7 HTTP** | middleware |
| anon → RPC | permission denied | permission denied (42501) — **verificado P7 RPC** | sin GRANT |
| authenticated no-miembro → RPC | sin grant (404-like) | `ERR_UNAUTHORIZED` (P0001) — **verificado P6** | `has_store_access_as` interno |
| authenticated miembro STORE A → orden STORE B | sin grant | 403 — **verificado P5** | `has_store_access_as(caller, order_store)` |
| authenticated miembro → su store | sin grant (roto) | 200 + costo server-side — **verificado P1** | flujo legítimo |
| service_role | EXECUTE | EXECUTE (sin cambios) | W9-F06 preservado |
| PUBLIC | sin EXECUTE | sin EXECUTE (guard POST) | sin privilegios globales |

## Defensas internas de `_v3` (SECURITY DEFINER seguro)

1. **`SET search_path TO 'public','extensions'`** — no hay objetos
   secuestrables por search_path manipulado (guard de la migration lo exige).
2. **Identity del caller desde el JWT**: `auth.uid()`; `p_user_id` solo se
   respeta para `service_role` — un `authenticated` NO puede suplantar a otro
   usuario vía parámetro.
3. **La store de referencia es la de la orden** (no la del parámetro):
   `v_order_store_id` leído de `production_orders` con `FOR UPDATE`.
4. **Validación explícita de acceso** aunque sea Definer (RLS no aplica
   dentro de DEFINER → la checks son en código, no en policies).
5. **No crea bypass de datos de inventario**: la única mutación de inventario
   pasa por `register_stock_movement` (camino canónico existente) con
   `p_skip_access_check := TRUE` — justificado: el acceso ya fue verificado
   para la MISMA store en la misma transacción (evita doble check, no salta
   el control).

## Lo que NO se concedió

- Nada más que EXECUTE sobre UNA función (firma completa, 1:1).
- Sin GRANT a tablas, sin BYPASSRLS, sin cambios de owner, sin wrappers nuevos.
- Rollback exacto documentado en el header de la migration (REVOKE 1:1).
