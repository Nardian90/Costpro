# 02 — ROOT CAUSE (F4-03)

## Causa raíz — desincronización ruta ↔ BD + aceptación de costo del cliente

### Capa 1: RPC muerta en el camino real

La migración histórica `20260810000003_v2_26_g3_withdraw_production_item.sql`
creó `withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text)` con
`GRANT EXECUTE TO authenticated` y **aceptando `p_unit_cost` del cliente**
(`actual_unit_cost = p_unit_cost`, `register_stock_movement(..., p_unit_cost := p_unit_cost)`).
Esa función NO existe en la BD viva (evolución posterior del esquema nunca
aplicada al proyecto / drift). La ruta quedó apuntando a un nombre muerto →
HTTP 500 (PGRST202) en el camino real de retiro.

### Capa 2: hardening W9-F06 dejó huérfana a la sucesora segura

`20260902000002_w9_f06_secdef_execute_hardening.sql` clasificó
`withdraw_production_item_v3` (que NO acepta `p_unit_cost` y deriva el costo
server-side — doctrina DF-05) como service-only:

```sql
REVOKE EXECUTE ON FUNCTION public.withdraw_production_item_v3(...) FROM authenticated;
GRANT EXECUTE  ON FUNCTION public.withdraw_production_item_v3(...) TO service_role;
```

Resultado: la única función segura de retiro quedó **sin consumidor HTTP
legítimo**. La ruta (único consumidor) quedó rota por la Capa 1.

### Capa 3: defecto contable del contrato de la ruta

Aunque la RPC existiera, el contrato de la ruta acepta
`p_unit_cost: unit_cost || 0` del body — el cliente determinaría el costo
contable del retiro de producción (COGS), en un sistema contable/inventario.
Esto es el defecto de diseño que la directiva manda eliminar.

## Síntesis

| Problema | Efecto |
|---|---|
| Ruta → RPC inexistente | Retiro HTTP muerto (500) |
| `_v3` sin GRANT authenticated | Función segura huérfana |
| `p_unit_cost` del cliente | Cliente determinaría COGS (inadmisible) |

La remediación debe reconectar el camino real a la autoridad server-side
SIN crear bypass de seguridad (directiva §5).
