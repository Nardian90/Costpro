# FASE F3 — 04 DEPENDENCY ANALYSIS (Gate F3-4: dependencias reales y resolución de objetos)

**Fecha**: 2026-09-27 · Método: análisis de cuerpos con el parser réplica del detector + `rg` dirigido sobre el stream. Objetivo del mandato: «determinar exactamente qué objeto se pretende invocar; no asumir que todo está en public».

## Cadena función → objetos por función (solo las con referencias relevantes)

### receive_production_output/4 (Caso A — resolución dependiente del path)

```text
receive_production_output/4 (SECDEF)
   ↓ tablas (NO calificadas → resueltas por search_path)
     products            → public.products   (existe en stream: schema public)
     production_orders   → public.production_orders
     production_order_items → public.production_order_items
   ↓ funciones (NO calificadas)
     register_stock_movement(...) → public.register_stock_movement
        (overloads /7 /8 /9 en stream; la llamada usa named-args p_product_id…p_variant_id,
         compatible con la canonical /10-param vigente en el momento de la definición 20260719;
         la resolución por nombre siempre cae en public.register_stock_movement)
   ↓ columnas
     cost_average → COLUMNA de public.products (falso positivo del regex de candidatos; verificado con contexto:
                    "SELECT stock_current, COALESCE(cost_average,0) … FROM products")
   ↓ schemas requeridos: pg_catalog (builtins now/GREATEST/COALESCE/SUM), public
```

### withdraw_production_item/4 (Caso A)

```text
withdraw_production_item/4 (SECDEF)
   ↓ tablas NO calificadas: production_order_items, production_orders → public.*
   ↓ funciones NO calificadas: register_stock_movement(...) → public.* (ídem receive)
   ↓ schemas requeridos: pg_catalog, public
```

### Las 7 restantes (resolución INDEPENDIENTE del path — todo calificado)

| función | tablas | funciones | tipos | schemas realmente usados |
|---|---|---|---|---|
| cleanup_old_aggregates/1 | public.usage_aggregates | — | — | pg_catalog (now), public |
| close_service_order_as_sale/6 | public.production_orders, public.transactions, public.transaction_items, public.products | — (VALUES/EXISTS son SQL, no fns) | — | pg_catalog, public |
| fn_audit_stock_reception/0 | public.audit_logs | auth.uid() (CALIFICADA) | — | pg_catalog (row_to_json, format), public |
| fn_audit_transaction_voiding/0 | public.audit_logs | auth.uid() (CALIFICADA) | — | pg_catalog, public |
| purge_old_reset_snapshots/1 | public.store_reset_snapshots | — | — | pg_catalog, public |
| snapshot_commission_rule/0 | public.commission_rule_versions | — | — | pg_catalog, public |
| upsert_usage_aggregate/7 | public.usage_aggregates | — | — | pg_catalog, public |

Chequeo explícito del mandato («si existe INSERT INTO table_name determinar el schema real»):

```text
$ rg -in "create table (if not exists )?(public\.)?(products|production_orders|production_order_items|usage_aggregates|store_reset_snapshots|audit_logs|commission_rule_versions|transactions|transaction_items)" supabase/migrations/*.sql
→ todas creadas en schema public (definiciones CREATE TABLE public.* o dentro del schema por defecto del stream = public)
```

No existe ningún objeto con los mismos nombres en `extensions`, `auth`, `storage` ni en ningún schema no-public que pudiera resolver distinto con el path nuevo (comprobado por ausencia de `extensions.products`, etc. y porque `pg_catalog` no contiene tablas de negocio). **Conclusión: con `pg_catalog` primero + `public` (+ `extensions` por coherencia de familia, vacío para estos cuerpos), la resolución de TODOS los objetos es idéntica a la PRE.**
