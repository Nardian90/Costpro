# 04 — REMEDIATION DESIGN (F4-03)

## Arquitectura objetivo (directiva §4)

```
HTTP
 ↓
API server (route con withAuth + validación)
 ↓
RPC/DB function autorizada  →  withdraw_production_item_v3 (SECURITY DEFINER)
 ↓
obtención server-side del costo real  →  products.cost_average (WAC) bajo FOR UPDATE
 ↓
movimiento de producción  →  production_order_items.actual_* + stock_movements(production_out)
 ↓
COGS/WAC/inventario  →  unit_cost server-side en todo el ledger + audit_logs (INV-15)
```

## Decisión: conectar el consumidor a la RPC segura (no crear segunda autoridad)

**Opción elegida: (B) route → `_v3` + GRANT EXECUTE a `authenticated`.**

Opciones evaluadas:
- (A) Crear wrapper nuevo `withdraw_production_item` que delegue en `_v3`:
  capa extra sin beneficio (duplicación), mayor superficie. DESCARTADA.
- (B) Route llama `_v3` directamente + migration de GRANT con guards. ✅
  La ruta ya valida sesión y `active_store_id`; `_v3` valida TODO lo demás
  internamente. Cambio mínimo, cero duplicación de fórmula/validación.
- (C) Solo GRANT sin tocar route: IMPOSIBLE — la firma de la ruta pasa
  `p_unit_cost` que `_v3` no acepta (PGRST202 por firma).

## Análisis de seguridad previo al GRANT (directiva §5 — OBLIGATORIO)

| Aspecto | Análisis de `_v3` (definición viva completa en raws) |
|---|---|
| SECURITY INVOKER/DEFINER | `SECURITY DEFINER`, **owner=postgres** (verificado por guard PRE de la migration) |
| search_path | `SET search_path TO 'public','extensions'` — fijado, sin secuestro de objetos |
| RLS | Definer corre como postgres (BYPASSRLS); la validación de acceso se hace EXPLÍCITAMENTE dentro: `has_store_access_as(v_caller_uid, v_order_store_id)` |
| Store isolation | La store de referencia es la de la ORDEN (`v_order_store_id`, no del parámetro); caller sin membresía → `ERR_UNAUTHORIZED` |
| Ownership | `created_by` de la orden no confiere privilegios: el acceso lo gobierna `has_store_access_as` |
| Tenant isolation | Membresías por store; caller `auth.uid()` derivado del JWT (no del parámetro, salvo service_role) |
| Validación de orden | Existe (`ERR_ORDER_NOT_FOUND`), pertenece a store (por construcción FK + isolation check), estado válido (`in_progress`/`approved` → `ERR_ORDER_NOT_EDITABLE`) |
| Validación de producto | `products WHERE id=v_product_id AND store_id=v_order_store_id` — producto de otra store → `ERR_PRODUCT_NOT_FOUND` (imposible cross-store por construcción: el producto viene del item de la orden) |
| Cantidad | `p_qty <= 0 → ERR_INVALID_QUANTITY`; overconsumption `actual+qty > budgeted → ERR_OVERCONSUMPTION` |
| Origen del costo | **`products.cost_average` bajo `FOR UPDATE`, sin fallback a 0**; WAC=0 exige flag documentado `w62_zero_cost_flags` (`ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED`); WAC NULL → `ERR_PRODUCT_COST_UNAVAILABLE` |
| Permisos indirectos | `register_stock_movement` invocado con `p_skip_access_check := TRUE` (legítimo: acceso ya validado; evita doble check, no lo salta) |
| Idempotencia | `check_idempotency`/`register_idempotency` con param_hash exhaustivo (scope `withdraw_v3`) |
| Concurrencia | `FOR UPDATE` en production_order_items, production_orders y products → serialización de retiros simultáneos |
| Auditoría | `audit_logs` INV-15 con `cost_authority='server_side_wac_v3'` y `unit_cost_used` |

Conclusión: `_v3` es segura para exposición a `authenticated`. El GRANT no
crea bypass (la función no confía en el cliente en NADA).

## Cambios concretos

### 1. Migration (única pieza de BD)

`supabase/migrations/20260909000001_rem_f4_03_grant_withdraw_production_item_v3.sql`
- GUARD PRE: firma exacta + secdef + owner postgres + search_path fijado +
  ACL PRE `{postgres,service_role}` (aborta si difiere).
- `GRANT EXECUTE ... TO authenticated` (1:1 por firma completa).
- GUARD POST: `anon=NO, authenticated=SÍ, service_role=SÍ, PUBLIC=NO`.
- Rollback documentado en el header (REVOKE 1:1).
- Determinista, versionada, repetible en entorno nuevo (los guards abortan
  con mensaje claro si el estado difiere).

### 2. Route fix (única pieza de código)

`src/app/api/production-orders/[id]/withdraw/route.ts`
- RPC objetivo: `withdraw_production_item_v3` con firma correcta (7 args,
  `p_unit_cost` ELIMINADO del contrato — el campo del body se IGNORA por
  diseño, documentado en comentarios).
- Errores nuevos mapeados: `ERR_UNAUTHENTICATED` (401), `ERR_ORDER_NOT_FOUND`
  (404), `ERR_OVERCONSUMPTION` (400), `ERR_PRODUCT_NOT_FOUND` (404),
  `ERR_PRODUCT_COST_UNAVAILABLE` (409), `ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED` (409).
- `idempotency_key` pass-through al registry oficial (ya existía).
- Cero cambios de UI, cero cambios de otros endpoints.

### 3. Autoridad de costo

Única fuente: `products.cost_average` (WAC) leído server-side bajo lock —
la MISMA autoridad del COGS de ventas. Sin nueva fórmula, sin duplicación,
sin lógica copiada del frontend.
