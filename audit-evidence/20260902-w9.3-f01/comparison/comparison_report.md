# W9.3 — COMPARACIÓN PRE → POST (F-01 RLS HARDENING)

| Campo | Valor |
|---|---|
| PRE capturado | 2026-09-02T18:05–18:18Z (evidence/f01/pre/) |
| Migración aplicada | 2026-09-02T18:22:53Z (HTTP 201, respuesta `[]`) |
| POST capturado | 2026-09-02T18:23–18:25Z (evidence/f01/post/) |
| Ventana de aplicación | ~35 segundos entre último PRE y primer POST |

## 1. RLS (relrowsecurity / relforcerowsecurity)

| Tabla | RLS PRE | FORCE PRE | RLS POST | FORCE POST | Cambio |
|---|---|---|---|---|---|
| store_credit_ledger | OFF | OFF | **ON** | OFF | previsto |
| wac_change_log | OFF | OFF | **ON** | OFF | previsto |
| w62_df04_design_params | OFF | OFF | **ON** | OFF | previsto |
| w62_df04_synthetic_rows | OFF | OFF | **ON** | OFF | previsto |
| w62_zero_cost_flags | OFF | OFF | **ON** | OFF | previsto |
| transaction_recovery_ledger | OFF | OFF | **ON** | OFF | previsto |
| **Resto de public (140 tablas)** | ON | (sin cambio) | ON | (sin cambio) | sin cambio |
| **Global `tables_rls_off`** | **6** | — | **0** | — | previsto (F-01 cerrado) |

FORCE permanece OFF en las 6 (decisión justificada: owner=postgres con BYPASSRLS ⇒ FORCE no-op). Global `rls_on_and_forced=7` sin cambios.

## 2. PRIVILEGIOS DE TABLA (has_table_privilege)

5 tablas expuestas (store_credit_ledger, wac_change_log, w62_df04_design_params, w62_df04_synthetic_rows, w62_zero_cost_flags):

| Rol | SELECT | INSERT | UPDATE | DELETE | | PRE |
|---|---|---|---|---|---|---|
| anon | true→**false** | true→**false** | true→**false** | true→**false** | | tenía ALL (arwdDxtm) |
| authenticated | true→**false** | true→**false** | true→**false** | true→**false** | | tenía ALL |
| service_role | true | true | true | true | | **sin cambio** |
| postgres | true | true | true | true | | **sin cambio** |
| PUBLIC | false | false | false | false | | **sin cambio** (nunca tuvo) |

transaction_recovery_ledger (grants intactos; solo RLS + policy nueva):

| Rol | SELECT | INSERT | Cambio |
|---|---|---|---|
| anon | false | false | sin cambio (nunca tuvo) |
| authenticated | false | false | sin cambio (nunca tuvo) |
| service_role | true | true | sin cambio |
| postgres | true | true | sin cambio |
| costpro_snapshot_restorer | true | true | **sin cambio** (preservado vía policy f01_snapshot_restorer_access) |

ACL cruda POST (h5_acl_raw.json): las 5 expuestas = `{postgres=arwdDxtm, service_role=arwdDxtm}`; tabla 6 = `{postgres=arwdDxtm, service_role=arwdDxtm, costpro_snapshot_restorer=ar}` (idéntica al PRE).

## 3. POLICIES

| Métrica | PRE | POST | Cambio |
|---|---|---|---|
| Policies en las 6 tablas target | 0 | **1** | +1 previsto: `f01_snapshot_restorer_access` ON transaction_recovery_ledger, PERMISSIVE ALL, TO costpro_snapshot_restorer |
| Total policies en public | 390 | **391** | +1 (la misma) |
| Policies en el resto del esquema | 390 | 390 | **0 cambios** |

## 4. PROBES POSTGREST (GET count-only, no destructivos)

| Probe | PRE | POST | Veredicto |
|---|---|---|---|
| anon /store_credit_ledger | 200 (*/0) | **401** | exposición eliminada |
| anon /wac_change_log | 200 (*/0) | **401** | exposición eliminada |
| anon /w62_df04_design_params | **206 (10 filas)** | **401** | fuga de datos cerrada |
| anon /w62_df04_synthetic_rows | **206 (8 filas)** | **401** | fuga de datos cerrada |
| anon /w62_zero_cost_flags | 200 (*/0) | **401** | exposición eliminada |
| anon /transaction_recovery_ledger | 401 | 401 | sin cambio |
| svc /store_credit_ledger | 200 | 200 | consumidor legítimo OK |
| svc /wac_change_log | 200 | 200 | consumidor legítimo OK |
| svc /w62_df04_design_params | (no probado PRE) | 206 (0-0/10) | datos accesibles para svc |
| svc /transaction_recovery_ledger | 200 (0-0/1) | 200 (0-0/1) | consumidor legítimo OK |
| anon /stores (control) | 206 (0-0/4) | 206 (0-0/4) | sin regresión colateral |

## 5. INTEGRIDAD DE DATOS (23 métricas — diff exacto)

`diff` entre pre/data_integrity.json y post/data_integrity.json → **SIN DIFERENCIAS (23/23 idénticas)**:
products=323, transactions=520, transaction_items=555, stock_movements=702, inventory_rows=141,
payment_transactions=366, devolutions=13, receipts=6, cash_closures=11, production_orders=0,
inventory_qty_sum=4978.6289, products_stock_sum=12094.6289, products_wac_sum=6852321.2457…,
wac_zero=105, wac_negative=0, wac_change_log=0, store_credit_ledger=0, tx_recovery_ledger=1,
w62_design_params=10, w62_synthetic_rows=8, w62_zero_cost_flags=0, audit_logs=7375, total_tables=146.

## 6. REGRESIÓN ESTRUCTURAL

| Métrica | PRE | POST | Cambio |
|---|---|---|---|
| Tablas (relkind=r, public) | 146 | 146 | 0 |
| Vistas + materialized | 11 | 11 | 0 |
| Policies | 390 | 391 | +1 (previsto) |
| Triggers no internos | 81 | 81 | 0 |
| Funciones public | 481 | 481 | 0 |
| FKs public | 261 | 261 | 0 |

(PRE de funciones/triggers tomado del estado W9.2-F verificado; el DDL de W9.3 —REVOKE/ENABLE RLS/CREATE POLICY— es estructuralmente incapaz de alterar funciones, triggers o FKs; tablas y vistas verificadas en vivo PRE y POST.)

## 7. NO-REGRESIÓN W9.2 (F-07)

`reset_store_data`: 2 overloads intactos, matriz idéntica al POST W9.2:
`(uuid,boolean)` y `(uuid,boolean,uuid)`: public=false, anon=false, authenticated=false, service_role=true, postgres=true. **W9.2 permanece cerrado.**
