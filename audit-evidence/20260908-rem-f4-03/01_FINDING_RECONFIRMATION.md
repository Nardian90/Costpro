# 01 — FINDING RECONFIRMATION (F4-03)

**Origen:** RECON 04d4f062 (veredicto RECON COMPLETE — P1s RECONFIRMED)
**Reconfirmación en vivo (esta corrida, SELECT-only):**

`evidence/remf403-db-functions-census.txt`:

| Función | Estado vivo | ACL |
|---|---|---|
| `withdraw_production_item` (6 args, histórica) | **NO EXISTE** | — |
| `withdraw_production_item_v3` | EXISTE (SECURITY DEFINER, owner postgres) | `{postgres, service_role}` — sin `authenticated` |
| `fn_recalc_wac` | EXISTE (REM-F4-04 intacto) | `{postgres, service_role}` |
| `register_reception` | EXISTE (REM-F4-04 intacto, 7 args) | `{=X, postgres, authenticated, service_role}` |

## Síntoma HTTP (RECON, reproducible)

```
POST /api/production-orders/[id]/withdraw
  → route llama supabase.rpc('withdraw_production_item', {...p_unit_cost...})
  → PGRST202: function public.withdraw_production_item(...) does not exist
  → HTTP 500 (la operación de retiro por el camino real está muerta)
```

## Estado de la ruta (repo, baseline b94ca369)

`src/app/api/production-orders/[id]/withdraw/route.ts`:
- RPC objetivo: `withdraw_production_item` (nombre muerto).
- Firma pasada: `(p_item_id, p_qty, p_unit_cost: unit_cost || 0 ← CLIENTE, p_store_id, p_user_id, p_idempotency_key)`.
- El frontend (`ProductionOrdersView.tsx`) envía `{ item_id, qty, unit_cost }`
  — el costo lo escribe el usuario en el cliente y viaja al RPC.
  **Inadmisible contablemente** (directiva F4-03).

## Conclusión

El defecto F4-03 permanece vivo y confirmado: camino real de retiro roto
(RPC ausente) + defecto de diseño (`p_unit_cost` del cliente). La sucesora
viva `_v3` ya implementa costo server-side pero quedó huérfana de consumidor
HTTP tras el hardening W9-F06 (REVOKE authenticated / GRANT service_role).
