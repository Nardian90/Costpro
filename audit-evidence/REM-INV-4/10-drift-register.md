# REM-INV-4 — 10-drift-register.md

## DRIFT REGISTER — Registro consolidado de divergencias Git/migrations ↔ PostgreSQL LIVE

**Baseline:** 793d1309 · **Misión:** ¿Puede el PostgreSQL LIVE reproducirse determinísticamente desde Git? · **Método:** censo Git (427 migraciones versionadas + 5 auxiliares) ↔ snapshot LIVE (484 funciones, 87 triggers, 391 policies, 146 tablas) con validación en PostgreSQL efímero (R1: 205 cuerpos byte-exacto, 0 artefactos de extracción; R2: replay secuencial completo).

**Métrica maestra (funciones públicas de aplicación, excluidas 188 propiedad de extensiones):**
309 funciones de app → **154 reproducibles (49.8%)** · **157 NO reproducibles desde Git (50.8%)** · 13 declaradas en Git ausentes en LIVE.

> Convención: LIVE≠Git es DRIFT (governance). LIVE==Git con lógica defectuosa sería BUG (fuera de scope aquí). Varios findings son DRIFT puro; ninguno requiere reabrir REM-INV-3C (cuyo caso quedó resuelto y commiteado en 20260913000001).

---

## F-01 · Esquema bootstrap ausente del repositorio
- **Object:** 53 tablas LIVE sin ningún CREATE TABLE en migraciones (products, stores, transactions, transaction_items, sale_items, sales, inventory, inventory_movements, inventory_batches, inventory_snapshots, stock_movements, audit_logs, business_events, cash_movements, cash_register_sessions, categories, cost_sheet_templates, cost_sheets, product_variants, profiles, purchase_items, purchase_order_items, purchase_orders, receipts, store_credit_ledger, store_notifications, suppliers, system_config, system_health_logs, system_metrics, units_of_measure, user_progress, user_strategy_feedback, user_usage, wac_change_log, pick3_profiles, pick3_ledger, pick3_history, pick3_simulations, pick3_user_plays, learning_cards, legal_models, legal_resolutions, price_change_history, ai_api_keys, bulk_ops_log, migration_history_snapshots, pr2_backup_*×2, transaction_recovery_ledger, w62_df04_*×2, w62_zero_cost_flags).
- **Git state:** DECLARED_ABSENT (nunca declaradas). **LIVE state:** PRESENT, con datos de negocio.
- **First known divergence:** origen del proyecto (el primer archivo de migración es 20240123 y ya presupone tablas). **Evidence:** raw/compare/tables-comparison.tsv; R2 (replay 427 archivos → solo 17 tablas).
- **Caller impact:** total (todo el dominio). **Security impact:** no directo (el estado LIVE funciona). **Accounting/Inventory impact:** ninguno en estado; riesgo en reconstrucción/DR.
- **Exploitability:** no es explotable; es irreproducibilidad.
- **Severity:** **D2 — HIGH governance** (determinismo de reconstrucción roto; el desastre-recovery desde Git es imposible).
- **Recommended remediation:** R2 — RECONCILE LATER. Gate independiente: generar baseline declarativo (pg_dump --schema-only a un bootstrap versionado + baselining de estados).

## F-02 · Ledger de migraciones desincronizado (proceso out-of-band sistémico)
- **Object:** `supabase_migrations.schema_migrations` (LIVE) vs `supabase/migrations/` (Git).
- **Git state:** 427 migraciones versionadas. **LIVE state:** solo **12 registradas como aplicadas** (202401230001 … 20260615000003; todas tienen archivo Git correspondiente — 0 huérfanos de ledger).
- **First known divergence:** tras 2026-06-15 el pipeline registrado se detiene; toda la era V2 (v2_0 … v2_26, PR-4.x, w9, hotfixes) se aplicó por canal no registrado (SQL editor / Management API / psql directo).
- **Evidence:** /tmp/r4-ledger.json → raw/staging/ledger-entries.json; census aux.
- **Caller impact:** ninguno directo. **Security impact:** procesal (sin trazabilidad de quién aplicó qué y cuándo). **Exploitability:** n/a.
- **Severity:** **D2 — HIGH (proceso/governance)**.
- **Recommended remediation:** R2 — Gate de reconciliación + control CI/CD `schema-drift-check` (§33: proponer, NO implementar aquí).

## F-03 · 64 funciones con cuerpo LIVE nunca declarado en Git (LIVE ADELANTADO)
- **Object:** 39 DRIFT_BODY + 25 DRIFT_SIGNATURE (ver raw/compare/functions-comparison.tsv; diffs completos en raw/compare/drift-diffs.md).
- **Git state:** últimos CREATE OR REPLACE declaran versiones más antiguas. **LIVE state:** cuerpos que no matchean NINGUNA versión histórica Git (md5 prosrc vs md5 bodies de las 653 creaciones censadas).
- **Naturaleza demostrada:** LIVE es **posterior** a Git en los casos core inspeccionados: create_sale_v2 (doctrina W62-05: orden determinista, FOR UPDATE en products, DF-02 costo servidor, guardas zero-WAC con w62_zero_cost_flags), create_devolution_v2 (DF-07: lock de venta original + tope acumulado ERR_DEVOLUTION_NO_ORIGINAL — verificado 9/9 en REM-INV-3R), register_stock_movement (A2 WAC HOTFIX v2.22.0 — remoción de WAC inline), check_idempotency (registry con INSERT ON CONFLICT + param_hash + espera pending), get_users_for_encargado (adaptado a user_store_access).
- **Funciones de negocio afectadas con callers activos en src/:** create_sale_v2 (POS checkout), create_devolution_v2 (NC), register_stock_movement, perform_inventory_adjustment, confirm_pending_reception, void_reception_with_reversal, confirm_transfer, close_cash_shift, soft_delete_store, get_products_for_pos, get_product_stock_ledger_paginated, reset_store_data, create_vale_salida ×2, create_store_with_membership, create_devolution, register_reception, get_audit_logs, get_sales_since_last_closure, update_transaction_taxes, validate_store_can_be_modified, release_expired_reservations, get_tenant_sales_summary, current_user_store_ids, has_store_access_as (lista completa: raw/compare/caller-impact.json).
- **Origin:** MIGRATION/EMERGENCY PATCH aplicado out-of-band (coherente con F-02); **para cada objeto individual el ORIGIN es UNKNOWN** (el ledger no registra nada).
- **Severity:** **D2 — HIGH** (comportamiento correcto aparente pero inauditable e irreproducible; las correcciones de 3C sobre fn_validate_document_transition SÍ quedaron commiteadas — caso único con traza).
- **Recommended remediation:** R2 — reconciliación (extraer cuerpos LIVE → baselining → versionar).

## F-04 · 3 funciones corriendo en producción una versión MÁS ANTIGUA que la final declarada en Git — fixes de seguridad no desplegados
- **Object / Git final / LIVE ejecuta:**
  1. `has_store_role(p_store_id uuid, p_roles text[])` — Git final: **20260820000001_security_fix_spoofable_caller_uid.sql** · LIVE: versión 20260727000008 (v2_12_12). **6 referencias en src/** (integración RLS, product-cost-sheets).
  2. `cancel_transfer(p_transfer_id uuid, p_user_id uuid)` — Git final: 20260802000002_v2_12_42_transfer_remediation.sql · LIVE: versión 20260727000008. 1 caller (transfer-service).
  3. `get_users_for_encargado(p_user_id uuid)` — Git final: 20260223_harden_user_management.sql · LIVE: versión original 20240123. 1 caller (gestión de usuarios).
- **Significado:** correcciones declaradas en Git que **nunca llegaron a producción**. En el caso (1), el nombre del archivo indica un fix anti-spoofing del caller uid sobre una función de AUTORIZACIÓN.
- **Severity:** **D1 — HIGH (candidato P1)** hasta demostrar impacto: la vulnerabilidad que (1) remedia puede seguir VIVA en producción. NO se eleva a P1 final sin reproducción (regla del gate). **Exploitability:** pendiente de verificación fuera de este gate (requiere staging con ambas versiones + JWT manipulado).
- **Recommended remediation:** **R3 — SECURITY REMEDIATION** en gate independiente (verificar si el spoofing sigue explotable LIVE; si sí, aplicar el fix declarado con pin de hashes).

## F-05 · Grant TRUNCATE/DML de extremos sobre audit_logs (y patrón de grants arwdDxtm heredado)
- **Object:** grants de tabla en audit_logs (y 7 tablas más de negocio) para anon/authenticated.
- **Git state:** 20260902000002_w9_f06_secdef_execute_hardening.sql endureció EXECUTE de RPCs, no grants de tabla; REM-INV-3R-B revocó INSERT/UPDATE/DELETE/TRUNCATE solo en devolutions/devolution_items.
- **LIVE state:** audit_logs mantiene arwdDxtm completo para anon+authenticated (incluye **TRUNCATE**, que RLS no cubre); inventario/products/stores/transactions/etc. ídem (patrón default Supabase). stock_movements = SELECT-only para authenticated (patrón endurecido de referencia); devolutions/devolution_items = rxt (post-3R-B verificado).
- **RLS LIVE:** audit_logs RLS ON con policy INSERT para authenticated + SELECT; sin policy DELETE (el TRUNCATE no pasa por policies).
- **Exploitability:** PostgREST no expone TRUNCATE; explotable solo vía SECURITY INVOKER RPC con TRUNCATE interno (no se identificó) o acceso SQL directo con esos roles (no existen como login roles). Consistente con la familia SEC-F02-1 ya tratada en 3R-B.
- **Severity:** **D2 — MEDIUM (defense-in-depth; P2-leaning si insider con acceso SQL)**.
- **Recommended remediation:** R3 — revocar TRUNCATE/DELETE (y revisar INSERT si el writer es service_role) sobre audit_logs para anon/authenticated en gate de hardening separado.

## F-06 · Referencia a trigger inexistente en el cuerpo LIVE de register_stock_movement
- **Object:** comentario interno de register_stock_movement (LIVE): "The trigger trg_update_product_wac handles WAC for receipt_items". **LIVE:** trg_update_product_wac NO existe (receipt_items solo tiene trg_check_reception_cost_variation + trg_sync_has_movements_receipt). Git lo declara (20260301_control_fallos_harden.sql) como MISSING_LIVE.
- **Impacto:** ambigüedad documental en la ruta de escritura de WAC (la actualización real ocurre dentro de fn_process_receipt/fn_recalc_wac). **Severity:** **D3 — LOW (documental)** con nota de seguimiento de integridad WAC. **Recommended remediation:** R2 (documentar la ruta WAC real en la reconciliación).

## F-07 · Migración 20260615000004 (fc_automation) jamás aplicada
- **Object:** tablas fc_automation_config / fc_pdf_cache / fc_generation_log + 11 policies + 2 triggers. **Git:** DECLARED_PRESENT. **LIVE:** ausente. **src/:** 0 referencias (feature nunca activada o abandonada).
- **Severity:** **D3 — LOW**. **Remediation:** R1/R2 (documentar como never-applied; decidir si la feature está muerta y retirar la migración).

## F-08 · Triggers de auditoría declarados en Git ausentes en LIVE
- **Object:** user_store_access.trigger_audit_store_access_changes (20260118_multi_store_audit), user_store_memberships.trigger_audit_user_store_memberships_changes (20260127_enhance_audit_logs), stock_movements.tr_audit_stock_reception + transactions.tr_audit_transaction_voiding (20260318_harden_audit_logging), receipt_items.trg_update_product_wac (20260301), user_preferences updated_at (20260703000005).
- **Impacto:** cobertura de auditoría declarada que no existe en runtime; las funciones audit_* asociadas existen pero sin trigger que las invoque (o invocadas por triggers out-of-band distintos: LIVE usa audit_profile_changes/audit_store_access_changes/audit_role_changes sobre otras tablas).
- **Severity:** **D2 — MEDIUM** (integridad de auditoría vs intención declarada). **Remediation:** R2 reconciliación.

## F-09 · Objetos de plataforma (extensiones y storage) — NO son drift de aplicación
- **Object:** 188 funciones propiedad de extensiones (btree_gist: gbt_*_*, *_dist; pg_trgm, etc.) + 4 triggers de storage.objects/buckets + policies de storage.
- **Classification:** ORPHAN_EXTENSION / ORPHAN_PLATFORM — **EXPECTED** (instalación de plataforma). **Severity:** n/a (D3 informativo). **Remediation:** R0 — LEAVE.

## F-10 · Subsistema pick3 + learning/academy completamente out-of-band
- **Object:** 5 tablas pick3_*, learning_cards, legal_models/resolutions, tipos pick3_ledger/learning_cards, funciones (process_pick3_transaction, on_pick3_profile_initial_bankroll, get_new_academy_cards, increment_user_usage, get/save_ai_api_key…), 20+ policies. **src/:** ACTIVO (navigation, páginas pick3, academy, usage-service).
- **Severity:** **D2 — MEDIUM** (feature en producción sin representación Git). **Remediation:** R2.

## F-11 · Residuo de prueba y tooling en producción
- **Object:** test_trace_id_setting() (0 callers); restore_transaction_snapshot(p_migration_id, p_tx_id) SECURITY DEFINER (0 callers src/); migration_history_snapshots/pr2_backup_* (tablas de respaldo ad-hoc).
- **Severity:** **D3 — LOW** (residuo); restore_transaction_snapshot merece revisión de grants en el mismo gate que F-05. **Remediation:** R2.

## F-12 · Atributos de seguridad divergentes en funciones con cuerpo reproducible
- **Object:** 2 funciones SECURITY DEFINER con drift de secdef: audit_profile_changes, audit_store_access_changes (cuerpo Git==LIVE; prosecdef difiere del declarado). 21 funciones con search_path divergente (drift de configuración; ver TSV).
- **Severity:** **D3 — LOW** (audit_* D2-leaning por ser secdef). **Remediation:** R2.

## F-13 · SQL no versionado mezclado en supabase/migrations/
- **Object:** DEMO_RESET_SCRIPT.sql / V2 / V3 (scripts destructivos de datos DEMO), sql_checks.sql, register_reception_rpc.sql.
- **Riesgo:** pueden ejecutarse fuera de orden o sobre entornos equivocados; register_reception_rpc.sql duplica contenido de migraciones versionadas. **Severity:** **D3 — LOW (proceso)**. **Remediation:** R2 (mover a supabase/scripts/ o eliminar).

---

## Totales por objeto
| Clase | Funciones | Triggers | Policies | Tablas |
|---|---|---|---|---|
| MATCH / reproducible | 151 (byte) + 1 (canónico) | 63 | 320 (existencia) | 93 |
| MATCH_STALE_VERSION (fix no desplegado) | 3 | — | — | — |
| DRIFT_BODY / DRIFT_SIGNATURE (LIVE nuevo) | 39 + 25 | — | — | — |
| DRIFT_ATTRS (secdef/search_path) | 23 | — | — | — |
| ORPHAN_LIVE (nunca declarado) | 55 | 24 (20 app + 4 plataforma) | 71 | 53 |
| ORPHAN_EXTENSION/PLATFORM | 188 | 4 storage | (incl. en 71) | — |
| MISSING_LIVE (Git declara, LIVE no) | 13 | 8 | 42 | 3 |

## Respuesta a la misión
¿Fue el caso REM-INV-3C aislado o sistémico? **SISTÉMICO (proceso)**: el swap out-of-band documentado en 3C es una instancia del patrón general (F-02/F-03) que afecta ~la mitad de la superficie funcional de app. La diferencia: 3C fue un caso de comportamiento de seguridad (fail-open) corregido y versionado; el patrón general es mayoritariamente LIVE-adelantado con fixes de Git pendientes de despliegue (F-04) y bootstrap irreconstruible (F-01).
