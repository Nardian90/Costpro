# W9.4.3 — H-1 · Mapa de consumidores (FASE 3) — 2026-09-02

Evidencia: `pre/h2b_triggers.json` (DB), `pre/h2d_policies.json` (DB),
`pre/h2e_internal_callers.json` (DB), `pre/h3_repo_consumers.txt` (repo, rg HEAD=033e05d9).

## Resultado DB-side

- **Policies RLS que referencian las 18: 0** (391 policies escaneadas).
- **Vistas/vistas materializadas que referencian las 18: 0** (11 vistas escaneadas).
- **Otras funciones SD cuyo prosrc menciona las 18: 0** (481 prosrc escaneados).
- **Triggers que usan las 4 funciones trigger: 8** (todos `tgenabled='O'`, origen habilitado):

| Trigger | Tabla | Función |
|---|---|---|
| trg_audit_cash_closures | cash_closures | audit_cash_closures_changes() |
| commission_rules_snapshot | commission_rules | snapshot_commission_rule() |
| commission_payments_touch_updated_at | commission_payments | touch_updated_at() |
| commission_rule_products_touch_updated_at | commission_rule_products | touch_updated_at() |
| commission_rules_touch_updated_at | commission_rules | touch_updated_at() |
| sales_transactions_touch_updated_at | sales_transactions | touch_updated_at() |
| workers_touch_updated_at | workers | touch_updated_at() |
| trigger_validate_active_store | profiles | validate_active_store() |

## Resultado repo-side (runtime)

| Función | Consumidor runtime | Cliente / contexto | Verificación |
|---|---|---|---|
| calculate_service_distribution | src/app/api/received-services/distribute/route.ts:49 | `admin.rpc` — inline `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` | service_role (L18-20) |
| cleanup_old_aggregates | src/app/api/cron/usage-sync/route.ts:365 | `admin.rpc` — inline `createClient(supabaseUrl, serviceKey)` | service_role (L221-222) |
| close_cash_shift | src/app/api/cash-closures/close/route.ts:29 | `supabaseAdmin.rpc` — `getSupabaseAdminSafe()` (L6, L26) | service_role |
| create_store_with_membership | src/app/api/stores/route.ts:236 | `admin.rpc` — `getSupabaseAdminSafe()` (L12, L199) | service_role |
| ensure_fiscal_period | (ninguno runtime; solo scripts/test_contract_rpcs_store_access.mjs) | test de contrato | — |
| get_product_cost_analysis | src/app/api/received-services/analysis/route.ts:23 | `admin.rpc` — inline `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` | service_role (L14-16) |
| get_products_for_reception | src/hooks/api/useReceptionProductSearch.ts:45 | frontend → PostgREST con sesión de usuario | **authenticated** (ACL tiene grant auth) |
| get_usage_forecast | (ninguno runtime — solo comentario en usage-sync L283) | — | — |
| get_usage_summary | src/app/api/usage/summary/route.ts:33 | `admin.rpc` — inline `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` | service_role (L27-31) |
| get_worker_commission_summary | src/app/api/commissions/summary/route.ts:33 | `supabase.rpc` — `getSupabaseForSession(session)` (L4, L32) | **authenticated** (RLS aplica) |
| mark_expired_lots | (ninguno runtime; test de contrato; comentario "cron job") | — | — |
| purge_old_reset_snapshots | src/app/api/cron/purge-snapshots/route.ts:32 | `supabase.rpc` — `getSupabaseAdminSafe()` (L25-26) | service_role |
| upsert_usage_aggregate | src/lib/usage-tracker.ts:176 | `supabaseAdmin.rpc` — inline `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` | service_role (L160-167) |
| void_transaction | src/hooks/api/useDocumentActions.ts:74 (flujo FIX F2-06, ventas) | `supabase.rpc` — `@/lib/supabaseClient` (browser, anon key + sesión usuario) | **authenticated** (ACL PUBLIC+anon+auth) |
| audit_cash_closures_changes | (ninguno — trigger DB) | — | DB interno |
| snapshot_commission_rule | (ninguno — trigger DB) | — | DB interno |
| touch_updated_at | (ninguno — 5 triggers DB) | — | DB interno |
| validate_active_store | (ninguno runtime; test de contrato) | trigger DB ON profiles | DB interno |

## Impacto sobre la corrección

- No se elimina ninguna función, no se cambia ninguna firma, no se cambia ACL.
- `ALTER FUNCTION ... SET search_path` NO altera el contrato RPC de PostgREST (mismo
  nombre, mismas columnas de retorno, mismas ACL) → consumidores frontend/authenticated
  (`get_products_for_reception`, `get_worker_commission_summary`, `void_transaction`)
  no requieren cambios de cliente.
- Las 4 funciones trigger ejecutan bajo el `proconfig` de la propia función (no del
  llamador) → triggers/firmas de tabla intactas.
