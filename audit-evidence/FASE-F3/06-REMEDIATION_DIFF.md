# FASE F3 — 06 REMEDIATION DIFF (diff exacto, atribución línea a línea)

**Fecha**: 2026-09-27 · Commit 1: `0d660541` `fix(security): harden function search paths`.

```text
$ git diff --stat   (PRE del commit)
 supabase/migrations/20260318_harden_audit_logging.sql                 | 4 ++--
 supabase/migrations/20260626000001_usage_tracking.sql                 | 4 ++--
 supabase/migrations/20260715000010_commission_rules_add_product_mode.sql | 2 +-
 supabase/migrations/20260715000014_fase6_robustness_fixes.sql         | 2 +-
 supabase/migrations/20260719000003_fix_double_stock_update_production_orders_v3.sql | 4 ++--
 supabase/migrations/20260726000001_v1_1_stabilization.sql             | 1 +
 6 files changed, 9 insertions(+), 8 deletions(-)
```

## Atribución 1:1 (9 líneas — todas son la ADICIÓN del atributo)

| # | archivo | línea | cambio |
|---|---|---|---|
| 4 | 20260318_harden_audit_logging.sql | 31 | `$$ LANGUAGE plpgsql SECURITY DEFINER;` → `…SECURITY DEFINER SET search_path = pg_catalog, public;` (fn_audit_transaction_voiding) |
| 3 | 20260318_harden_audit_logging.sql | 62 | ídem (fn_audit_stock_reception) |
| 8 | 20260626000001_usage_tracking.sql | 129 | ídem (upsert_usage_aggregate) |
| 1 | 20260626000001_usage_tracking.sql | 272 | ídem (cleanup_old_aggregates) |
| 7 | 20260715000010_commission_rules_add_product_mode.sql | 71 | ídem (snapshot_commission_rule) |
| 2 | 20260715000014_fase6_robustness_fixes.sql | 123 | `…SECURITY DEFINER;` → `…SECURITY DEFINER SET search_path TO 'public', 'extensions';` (close_service_order_as_sale/6) |
| 9 | 20260719000003_…v3.sql | 59 | ídem (withdraw_production_item/4) |
| 6 | 20260719000003_…v3.sql | 129 | ídem (receive_production_output/4) |
| 5 | 20260726000001_v1_1_stabilization.sql | 302 | nueva línea `SET search_path = pg_catalog, public` en el header, antes de `AS $$` (purge_old_reset_snapshots) |

## Lo que el diff NO contiene (verificación negativa)

```text
$ git diff | rg -c "^-[^-]"          → 8 líneas eliminadas (los 8 trailers originales sustituidos)
$ git diff | rg -i "grant|revoke|policy|create table|alter table|drop"  → 0 coincidencias
$ git diff -- package.json bun.lock package-lock.json src/ server.ts next.config.ts e2e/ → VACÍO
```

- 0 cambios de cuerpos, firmas, retornos, volatilidad, ACLs, RLS, triggers, tablas.
- 0 archivos fuera de `supabase/migrations/` en el commit 1.
- Los 8 trailers sustituidos conservan byte a byte su prefijo (`$$ LANGUAGE plpgsql SECURITY DEFINER`) — solo se añade el sufijo del atributo antes del `;`.
