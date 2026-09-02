# W9.4.3 — H-1 · Clasificación de riesgo (FASE 2) — 2026-09-02

Fuente de verdad: catálogo PostgreSQL vía Management API (evidencia `pre/h1a_sd_full.json`,
`pre/h1b_sd_missing.json`, `pre/h2a_functiondefs.json`, `pre/h2_analysis_static.json`).
Inventario total: **481 funciones en `public`; 242 SECURITY DEFINER; 224 con `search_path`
explícito (Clase A); 18 sin `search_path` (candidatas H-1)**.

Metodología por función: lectura completa del cuerpo (`pg_get_functiondef`), detección de
SQL dinámico (`EXECUTE`, `format()`, `quote_ident()`, `quote_literal()`), referencias de
objetos sin cualificar (FROM/JOIN/INTO/UPDATE/PERFORM/DELETE + `%ROWTYPE` + casts de tipos),
tablas sensibles, uso de `auth.*`, uso de extensiones, overloads, y consumidores DB-side
(triggers/policies/vistas/llamadores internos) y repo-side.

Resultado del análisis estático de los 18 cuerpos:
- **0 funciones con SQL dinámico** (ninguna usa EXECUTE/format/quote_ident/quote_literal).
- **0 llamadas a funciones de extensiones** (`uuid_generate*`, `crypt`, `digest`, etc.).
- **0 overloads** entre las 18 (todas con firma única — ALTER seguro por firma exacta).
- **4 funciones con referencias de objetos sin cualificar** → vector real de resolución
  de nombres elevado (Clase C).
- **14 funciones con cuerpo 100% cualificado** (`public.*`, `auth.*`, builtin pg_catalog)
  → sin superficie de secuestro hoy; riesgo residual = mutabilidad de search_path
  ante futuras modificaciones del cuerpo (Clase B).
- **0 funciones Clase D** (cuerpos completos analizados; sin dependencias desconocidas).

Nota sobre `pg_temp`: PostgreSQL busca el schema temporal **antes que pg_catalog** para
nombres de relación y tipo cuando `pg_temp` no está listado explícitamente en el path
(docs PG "The System Catalog Schema"). Por tanto, para funciones con referencias sin
cualificar, `pg_catalog, public` NO elimina el vector: se requiere fijar `pg_temp` al
final (`pg_catalog, public, pg_temp`) — patrón oficial de los docs de CREATE FUNCTION
(`SET search_path = trusted, pg_temp`) y ya con precedente en este repositorio
(migraciones iteration-11-2/12 usan `SET search_path TO public, pg_temp`).

## Clasificación (18)

| # | OID | Firma | Exposición EXECUTE | SQL dinámico | Refs sin cualificar | Tablas sensibles | Clase |
|---|------|--------|--------------------|--------------|---------------------|------------------|-------|
| 1 | 138218 | audit_cash_closures_changes() | svc,pg (trigger) | No | No | audit_logs | **B** |
| 2 | 132722 | calculate_service_distribution(uuid) | svc,pg | No | **Sí**: received_services, service_reception_links, receipt_items (+3 %ROWTYPE) | receipt_items | **C** |
| 3 | 132926 | cleanup_old_aggregates(integer) | svc,pg | No | No | usage_aggregates | **B** |
| 4 | 138285 | close_cash_shift(uuid,numeric,numeric,text,uuid) | svc,pg | No | No (pg_advisory_xact_lock=pg_catalog) | transactions, payment_transactions, commission_payments, cash_closures, audit_logs, z_reports | **B** |
| 5 | 138143 | create_store_with_membership(text×9,uuid×2,integer,dp×2) | svc,pg | No | No | stores, profiles, user_store_memberships, audit_logs | **B** |
| 6 | 136259 | ensure_fiscal_period(uuid,integer,integer) | svc,pg | No | No | fiscal_closings | **B** |
| 7 | 132723 | get_product_cost_analysis(uuid,uuid) | svc,pg | No (SQL puro) | **Sí**: receipt_items, receipts, service_cost_distributions, received_services, service_types | receipts, receipt_items | **C** |
| 8 | 132197 | get_products_for_reception(uuid,text,integer,integer) | auth,svc,pg | No | **Sí**: products | products | **C** |
| 9 | 132940 | get_usage_forecast() | svc,pg | No | No | usage_thresholds, usage_aggregates | **B** |
| 10 | 132924 | get_usage_summary(integer) | svc,pg | No | No | usage_aggregates | **B** |
| 11 | 135148 | get_worker_commission_summary(uuid,date,date) | auth,svc,pg | No | No | workers, sales_transactions, commission_payments, commission_rules | **B** |
| 12 | 136485 | mark_expired_lots(uuid) | svc,pg | No | No | product_lots | **B** |
| 13 | 135446 | purge_old_reset_snapshots(integer) | svc,pg | No | No | store_reset_snapshots | **B** |
| 14 | 133149 | snapshot_commission_rule() | svc,pg (trigger) | No | No | commission_rule_versions | **B** |
| 15 | 133144 | touch_updated_at() | svc,pg (trigger) | No | No | — (solo NEW/OLD) | **B** |
| 16 | 132923 | upsert_usage_aggregate(tstz,tstz,text,text,text,integer,dp) | svc,pg | No | No¹ | usage_aggregates | **B** |
| 17 | 38664 | validate_active_store() | svc,pg (trigger ON profiles) | No | **Sí (tipo)**: user_role (DECLARE + 6 casts ::user_role) | user_store_memberships, profiles | **C** |
| 18 | 138000 | void_transaction(uuid,text,tstz,uuid) | **PUBLIC,anon,auth,svc,pg** | No | No | transactions, transaction_items, product_variants, audit_logs | **B** |

¹ `usage_aggregates.count` en `DO UPDATE SET` se liga a la tabla objetivo de la propia
sentencia (entrada de rango tabla ya vinculada), no se resuelve vía search_path — analizado
y documentado. Igualmente la función es Clase B (defensa en profundidad por proconfig).

Resumen: **A=224 · B=14 · C=4 · D=0**
