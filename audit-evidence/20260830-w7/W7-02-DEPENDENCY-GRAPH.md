# W7-02 — DEPENDENCY GRAPH REAL (FASE 3)

Método: reconstrucción desde catálogos PostgreSQL 17.11 sobre `costpro_audit_v2` (clone byte-idéntico del snapshot de producción, S1 DIFF=0). Solo SELECT. Fuentes: pg_proc, pg_depend, pg_trigger, pg_constraint, pg_class, pg_namespace + grep de `prosrc`. Salidas crudas: `w7-readiness/tmp/depgraph-{1..6}*.txt`. **El grafo documental de W6.2 (W62-02) NO fue aceptado; todo lo siguiente es re-derivado de catálogos.**

## 3.1 Inventario de firmas (baseline, 17 objetos)

| Función | Firmas | SECDEF | Observación ACL |
|---|---|---|---|
| withdraw_production_item | 2 (6-arg, 9-arg) | ambas | SIN authenticated (solo postgres+service_role) — ruta app ya rota por ACL (hallazgo W6.1) |
| receive_production_output | 2 (4-arg, 6-arg) | ambas | 6-arg: **PUBLIC + anon EXECUTE** |
| create_vale_salida | 2 (5-arg, 6-arg) | ambas | authed + service_role |
| create_devolution | 2 (9-arg, 10-arg) | ambas | authed + service_role |
| create_devolution_v2 | 1 (10-arg) | sí | **PUBLIC EXECUTE (=X/postgres)** |
| close_production_order_v2 | 1 (11-arg) | sí | **PUBLIC + anon EXECUTE** |
| update_product_wac | 1 (0-arg, motor B) | sí | trigger de receipt_items; EXECUTE a authenticated (expuesto como RPC 0-arg por PostgREST) |
| fn_recalc_wac | 0 (no existe aún) | — | — |
| register_stock_movement | 1 (12-arg) | sí | postgres + service_role only |
| create_transfer / confirm_transfer / reverse_transfer | 1 c/u | sí | authed + service_role |
| reverse_devolution / reverse_adjustment | 1 c/u | sí | authed + service_role |

## 3.2 Callers internos reales (pg_proc.prosrc regex \m\M)

| Target | Callers internos | Consecuencia migratoria |
|---|---|---|
| **withdraw_production_item** (ambas firmas) | `create_vale_salida` 5-arg y 6-arg (los 2º callers) | pkg 04 reescribe AMBAS firmas de vale_salida → llaman `withdraw_production_item_v3`. Sin callers internos restantes de la legacy |
| **receive_production_output** 6-arg | `close_production_order_v2` (auto-chain close→receive) | pkg 07 reescribe close_v2 → mantiene la chain sobre la 6-arg endurecida. Coherente |
| **register_stock_movement** | **35 funciones** (record_sale_movement, cancel_reception, deduct_stock, confirm/reverse_transfer, receive_production_output ×2, create_sale, create_sale_v2, reverse_transaction_v2, register_reception, vale_salida ×2, withdraw ×2, devolution_v2, etc.) | NINGUNA firma de register_stock_movement cambia en W6.2 → cero impacto migratorio; su ACL (postgres+service_role) ya la excluye de PostgREST |
| **update_product_wac()** | 0 dependientes en pg_depend; 1 dependiente único: trigger `trg_update_product_wac` ON receipt_items | pkg 01 dropea trigger y luego función — orden correcto, sin referencias huérfanas |

## 3.3 Escritores de `cost_average` — barrido AMPLIO (no solo nombres "wac")

Query: `prosrc ~ 'cost_average\s*=\s*'` sobre las 478 funciones públicas → **15 escritores**:

| Escritor | Tratamiento W6.2 | Clasificación final |
|---|---|---|
| confirm_pending_reception | convertida (pkg 01) | → fn_recalc_wac |
| fn_process_receipt 3-arg | convertida (pkg 01) | → fn_recalc_wac |
| fn_process_receipt 4-arg | convertida (pkg 01) | → fn_recalc_wac |
| perform_inventory_adjustment | convertida (pkg 01) | → fn_recalc_wac |
| cancel_reception | convertida (pkg 01) | → fn_recalc_wac |
| reverse_receipt_v2 | convertida (pkg 01) | → fn_recalc_wac |
| void_reception_with_reversal | convertida (pkg 01) | → fn_recalc_wac |
| receive_production_output 6-arg | convertida (pkg 01) | → fn_recalc_wac |
| receive_production_output 4-arg | re-creada como DELEGADORA (pkg 01 S2) | su write desaparece |
| reverse_production_order | convertida (pkg 01) | → fn_recalc_wac |
| void_closed_production_order | convertida (pkg 01) | → fn_recalc_wac |
| create_devolution 10-arg | convertida (pkg 01) | → fn_recalc_wac |
| **update_product_wac()** | **DROP** (motor B) + trigger | eliminada por diseño |
| **reset_store_data(uuid,boolean)** | NO convertida | **FAIL-CLOSED**: guard la bloquea post-migración (W62-10 §9.5; dueño decide conservar/rediseñar) |
| **reset_store_data(uuid,boolean,uuid)** | NO convertida | ídem |

Verificación cruzada: `guard_triggers_preexisting = 0` (el guard no existe en baseline — no interferirá con la auditoría); funciones que fijan el token `app.wac_writer` en baseline: **NINGUNA** (el token no es forjable desde ningún RPC preexistente).

## 3.4 Dispatch dinámico / aliases

4 funciones usan `to_regprocedure` / `EXECUTE format(...)`: `validate_pre_restore_fk_integrity`, `create_pre_restore_snapshot`, `restore_store_backup`, `restore_transaction_snapshot` (maquinaria restore_mode). No escriben `cost_average` directamente (0 matches en el barrido); requieren roles restaurador/postgres. Única dependencia indirecta potencial con WAC: `reset_store_data` (cubierta arriba). Ningún alias dinámico hacia los 11 objetos de atención especial.

## 3.5 Superficie PostgREST (EXECUTE efectivo)

| Objeto | PUBLIC | anon | authenticated | service_role | Cambio con W6.2 |
|---|---|---|---|---|---|
| close_production_order_v2 11-arg | ✓ | ✓ | ✓ | ✓ | pkg 04 REVOKE PUBLIC+anon → authed+service (FIX) |
| receive_production_output 6-arg | ✓ | ✓ | ✓ | ✓ | pkg 04 REVOKE PUBLIC+anon → authed+service (FIX) |
| **create_devolution_v2 10-arg** | **✓** | ✗ | ✓ | ✓ | **NINGÚN paquete la revoca — F-A** |
| **reset_store_data 2-arg** | **✓** | **✓** | ✓ | ✓ | **NINGÚN paquete la revoca — F-B** (auth interna: has_management_access_as ⇒ anon obtiene ERR_UNAUTHORIZED) |
| withdraw 6-arg / 9-arg | ✗ | ✗ | ✗ | ✓ | pkg 04 RENAME+REVOKE total (deprecated) |
| create_vale_salida 5-arg / 6-arg | ✗ | ✗ | ✓ | ✓ | redefinidas (firma intacta), ACL persiste |
| register_stock_movement | ✗ | ✗ | ✗ | ✓ | sin cambio |

## 3.6 Constraints payment_transactions (baseline pre-pkg08)

7 constraints: amount_check, currency_check, payment_method_check, pkey, **ref_type_check (SIN 'devolution')**, sale_ref_check, transaction_id_fkey (ON DELETE RESTRICT). pkg 08 reconstruye ref_type_check añadiendo 'devolution', añade `direction` + direction_check + devolution_ref_check (analógica a sale_ref_check). Validación de la nueva constraint = full scan → ver FASE 1 H2 (PRECHECK vivo).

## 3.7 Hallazgos nuevos de FASE 3

| # | Hallazgo | Severidad | Bloquea W7? |
|---|---|---|---|
| **F-A** | `create_devolution_v2` conserva `=X/postgres` (PUBLIC EXECUTE) post-migración; ningún paquete la revoca. Anon llama → ERR_UNAUTHORIZED (auth interna correcta), pero es la MISMA clase de hallazgo que W6.2 corrigió en close/receive (INV-13) | MEDIUM | NO (mitigación interna), pero recomienda REVOKE en W7 con aprobación del dueño |
| **F-B** | `reset_store_data(uuid,boolean)` expone PUBLIC+anon EXECUTE (masa DELETE + restore_mode). Auth interna has_management_access_as bloquea anon | MEDIUM | NO (mitigación interna); hardening recomendado |
| **F-C** | `reset_store_data` (ambas firmas) escribirá cost_average sin token → guard la bloquea tras pkg 01 → **la ruta admin `/api/stores/reset` (route.ts L170) romperá** | HIGH (compat, fail-closed) | NO (fail-closed, sin riesgo financiero), pero REQUIERE decisión del dueño antes de W7 (documentado W62-10 §9.5) |
| **F-D** | 35 callers de register_stock_movement sin writes de cost_average fuera del set convertido — no existen escritores WAC ocultos entre callers indirectos | (confirmación) | — |

Estos hallazgos se integran en W7-03 (ACL) y W7-04 (compat) y en la matriz final W7-14.
