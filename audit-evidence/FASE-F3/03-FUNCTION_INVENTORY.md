# FASE F3 — 03 FUNCTION INVENTORY (Gates F3-1 + F3-2: inventario y clasificación 16 puntos)

**Fecha**: 2026-09-27 · Método: parser réplica del detector (`scripts/f3-analyze.cjs`, mismo extractor/comentario-stripping) + `SC_STATIC_EXPORT` del propio detector (última definición last-wins por clave `schema.name/argc`) + `rg` sobre el stream completo. Crudo: `scripts/f3-analysis.json` (PRE) / re-ejecución POST.

## Tabla obligatoria Gate F3-1

| # | schema | función | signature (args → retorno) | archivo (última definición, last-wins) | causa exacta del detector |
|---|---|---|---|---|---|
| 1 | public | cleanup_old_aggregates | (p_days integer DEFAULT 30) → integer | `20260626000001_usage_tracking.sql` (líneas 262–272) | `!/SET search_path/i` sobre el texto de la definición (SECDEF+write) |
| 2 | public | close_service_order_as_sale | (p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP', p_exchange_rate numeric DEFAULT 1.0) → uuid | `20260715000014_fase6_robustness_fixes.sql` (67–123) | ídem |
| 3 | public | fn_audit_stock_reception | () → TRIGGER | `20260318_harden_audit_logging.sql` (42–62) | ídem |
| 4 | public | fn_audit_transaction_voiding | () → TRIGGER | `20260318_harden_audit_logging.sql` (7–31) | ídem |
| 5 | public | purge_old_reset_snapshots | (p_days INTEGER DEFAULT 30) → integer | `20260726000001_v1_1_stabilization.sql` (298–311) | ídem |
| 6 | public | receive_production_output | (p_order_id UUID, p_product_id UUID, p_quantity NUMERIC, p_store_id UUID) → VOID | `20260719000003_fix_double_stock_update_production_orders_v3.sql` (61–129) | ídem |
| 7 | public | snapshot_commission_rule | () → TRIGGER | `20260715000010_commission_rules_add_product_mode.sql` (36–71) | ídem |
| 8 | public | upsert_usage_aggregate | (p_bucket_start TIMESTAMPTZ, p_bucket_end TIMESTAMPTZ, p_metric_type TEXT, p_service TEXT DEFAULT 'api', p_endpoint TEXT DEFAULT NULL, p_count INTEGER DEFAULT 1, p_sum_value DOUBLE PRECISION DEFAULT 0) → VOID | `20260626000001_usage_tracking.sql` (109–129) | ídem |
| 9 | public | withdraw_production_item | (p_item_id UUID, p_qty NUMERIC, p_unit_cost NUMERIC, p_store_id UUID) → VOID | `20260719000003_fix_double_stock_update_production_orders_v3.sql` (7–59) | ídem |

Verificación 1:1 contra F1/F2/baseline: **9/9 coinciden; 0 funciones nuevas** → no procede STOP.

Nota de versiones: hash Git de cada definición = blob de su archivo en c09366ed (los diffs POST en 06 muestran línea a línea). El detector no genera hashes por función; F3 aporta sha256 de cuerpo por función (PRE en `scripts/f3-analysis.json`; igualdad PRE=POST probada en 08).

## Clasificación Gate F3-2 (16 criterios por función)

| Criterio | 1 cleanup | 2 close_service/6 | 3 fn_audit_recep | 4 fn_audit_void | 5 purge | 6 receive/4 | 7 snapshot | 8 upsert | 9 withdraw/4 |
|---|---|---|---|---|---|---|---|---|---|
| 1. SECURITY DEFINER | SÍ | SÍ | SÍ | SÍ | SÍ | SÍ | SÍ | SÍ | SÍ |
| 2. SECURITY INVOKER | no | no | no | no | no | no | no | no | no |
| 3. SET search_path actual (PRE) | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE |
| 4. Tablas sin schema | 0 | 0 | 0 | 0 | 0 | **SÍ** (products, production_orders, production_order_items) | 0 | 0 | **SÍ** (production_order_items, production_orders) |
| 5. Funciones sin schema | 0 | 0 | 0 | 0 | 0 | **SÍ** (register_stock_movement) | 0 | 0 | **SÍ** (register_stock_movement) |
| 6. Tipos sin schema | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 7. Uso de `public` | public.* calificado | public.* calificado | public.audit_logs | public.audit_logs | public.* calificado | implícito | public.* calificado | public.* calificado | implícito |
| 8. Schemas propios | public | public | public | public | public | public | public | public | public |
| 9. pg_catalog | now() implícito | now() implícito | row_to_json, format | row_to_json, format | NOW() implícito | now()/GREATEST implícitos | now() implícito | now() implícito | now() implícito |
| 10. Dependencias externas | 0 | 0 | auth.uid() (calificado) | auth.uid() (calificado) | 0 | register_stock_movement (public) | 0 | 0 | register_stock_movement (public) |
| 11. Parámetros controlables por usuario | p_days (cron) | p_order_id… (RPC) | — (trigger) | — (trigger) | p_days (cron) | p_order_id, p_product_id, p_quantity, p_store_id | — (trigger) | 7 params (interno service_role) | p_item_id, p_qty, p_unit_cost, p_store_id |
| 12. Ejecutable desde ruta API | SÍ `/api/cron/usage-sync` | no (0 refs en src; RPC service_role) | no (trigger) | no (trigger) | SÍ `/api/cron/purge-snapshots` | SÍ `/api/production-orders/[id]` | no (trigger) | SÍ vía `src/lib/usage-tracker.ts` | SÍ `/api/production-orders/[id]/withdraw` |
| 13. EXECUTE para PUBLIC (stream) | REVOKE PUBLIC (20260916000003) | default histórico (overload /6; la LIVE /7: REVOKE PUBLIC,anon,auth) | sin grant explícito | sin grant explícito | GRANT auth+service_role → luego REVOKE PUBLIC + GRANT service_role | LIVE /6: authenticated+service_role | REVOKE PUBLIC,anon,auth → service_role | REVOKE PUBLIC,anon,auth → service_role | /9: REVOKE + authenticated |
| 14. ACL específica | service_role | service_role (LIVE) | — | — | service_role | authenticated, service_role | service_role | service_role | authenticated |
| 15. Parte de ruta auth/RLS | no (borrado por edad) | no (cierre OT compensa auth) | no (auditoría) | no (auditoría) | no | no (recibe output; guard en ruta) | no (snapshot trigger) | no (agregados) | no (descuento material) |
| 16. ¿Cambiar search_path puede alterar resolución? | No (todo calificado) | No (todo calificado) | No (todo calificado) | No (todo calificado) | No (todo calificado) | **No** si el nuevo path incluye public (ver 04) | No (todo calificado) | No (todo calificado) | **No** si incluye public (ver 04) |

Nota ACL: los REVOKE/GRANT listados son los statements existentes en el stream — F3 **no añade, quita ni modifica ninguno** (06).
