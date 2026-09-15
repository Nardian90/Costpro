# R2 — INVENTARIO SECDEF-READ/MIXED DE PRODUCCIÓN (read-only)

timestamp: 2026-09-16 · alcance: Supabase LIVE `wthkddeleylijmonclxg` · método: pg_proc + pg_get_functiondef vía Management API (SELECT only) + análisis estático de bodies · fuente cruda: `r2-inventory.json` (este directorio)

## Censo total SECURITY DEFINER (esquema public)

| Clase | N | Cobertura contract |
|---|---|---|
| WRITE (DML, sin retorno de datos) | 141 | Layer A/B/C (surface certificado REM-INV-6R) |
| WRITE-MIXED (DML + RETURN QUERY) | 3 | Layer A/B (superficie write); ACL service_role-only (bulk_update_products, detect_orphan_users, sync_inventory_from_products) → no alcanzables por authenticated |
| READ (acceso a tablas, sin DML) | 60 | **NO cubierto por el contract (gap histórico R2)** — analizados aquí |
| UTILITY (sin acceso a tablas) | 42 | fuera de alcance (no acceden a datos) |

De los 63 READ/WRITE-MIXED, **22 son ejecutables por `authenticated`** (los demás service_role-only). Tabla completa:

| Función | Inputs | Caller app | store_id | auth.uid() | Guard | RLS bypass | ACL:auth | Riesgo |
|---|---|---|---|---|---|---|---|---|
| `current_user_store_ids()` | — | helper interno | n/a | sí | helper | sí (SECDEF) | sí | NO FINDING |
| `get_audit_logs(uuid,text,ts,ts)` | p_store_id… | vista auditoría | param | sí | SÍ (store_access) | sí | sí | NO FINDING |
| `get_batch_store_daily_kpis(uuid[],date)` | p_store_ids[] | useMultiStoreDashboard.ts | array validado por elemento | vía guard | **SÍ (000004)** | sí | sí | NO FINDING |
| `get_cash_closures(uuid,date,date,int)` | p_store_id… | reports/data-fetcher.ts | **param, NULL→TODAS las tiendas** | NO | **NO** | sí | sí | **F1 HIGH** |
| `get_daily_expenses_aggregated(uuid,date,date,int)` | p_store_id… | reports/data-fetcher.ts | param, NULL→todas | NO | **NO** | sí | sí | **F4 LOW** |
| `get_low_stock_count(uuid)` | p_store_id | useStoreNotifications.ts | param, NULL→todas | NO | **NO** | sí | sí | **F4 LOW** |
| `get_paginated_products(uuid,text,text,int,int)` | p_store_id… | useInventory.ts +3 | param obligatorio | NO | **NO** | sí | sí | **F3 MED** |
| `get_paginated_products_v2(int,int,uuid,text,…)` | p_store_id… | sin uso directo | param | sí | SÍ (store_access) | sí | sí | NO FINDING |
| `get_product_stock_ledger_paginated(uuid,uuid,int,int)` | p_product_id, p_store_id | useKardex.ts | param, store NULL→todas | NO | **NO** | sí | sí | **F3 MED** |
| `get_products_for_pos(uuid,text,text,int)` | p_store_id… | POS | param | sí | SÍ (store_access) | sí | sí | NO FINDING |
| `get_products_for_reception(uuid,text,int,int)` | p_store_id… | useReceptionProductSearch.ts | param obligatorio | NO | **NO** | sí | sí | **F3 MED** |
| `get_sales_since_last_closure(uuid)` | p_store_id | cash-service.ts | param obligatorio | NO | **NO** | sí | sí | **F3 MED** |
| `get_store_analytics_advanced(uuid,date,date,int)` | p_store_id… | useStoreAnalytics.ts | param obligatorio | NO | **NO** | sí | sí | **F3 MED** |
| `get_transactions(uuid,text,ts,ts,…)` | p_store_id… | vista transacciones | param | sí | SÍ (store_access) | sí | sí | NO FINDING |
| `get_transferable_stores(uuid,uuid)` | p_user_id, p_current_store_id | transfers UI | — | sí + bind estricto | SÍ (RC-3: p_user_id≠auth.uid()→RAISE; +has_store_access_as) | sí | sí | NO FINDING |
| `get_transfers(uuid,ts,ts,text,int)` | p_store_id… | reports/data-fetcher.ts | **param, NULL→TODAS** | NO | **NO** | sí | sí | **F2 HIGH** |
| `has_store_access(uuid)` | p_store_id | helper canónico | — | sí | helper | sí | sí | NO FINDING |
| `has_store_role(uuid,uuid,text[])` | p_user_id, p_store_id | helper | — | sí | helper | sí | sí | NO FINDING |
| `has_store_role(uuid,text[])` | p_store_id | helper | — | sí | helper | sí | sí | NO FINDING |
| `is_admin_with_access(uuid)` | p_store_id | helper | — | vía store_access | helper | sí | sí | NO FINDING |
| `is_managed_user(uuid)` | p_target_user_id | asignaciones | — | sí | SÍ (scoped por store compartido, boolean) | sí | sí | NO FINDING |
| `is_store_member(uuid)` | p_store_id | helper | — | sí | helper | sí | sí | NO FINDING |

ACL de TODOS los anteriores: `{postgres, authenticated, service_role}` = EXECUTE (verificado en catálogo LIVE). Los READ/WRITE-MIXED restantes (60+3−22) son service_role-only → no alcanzables por clientes.
