# W9.4.6 — H-5 · FASE 4 · Matriz de versiones `reverse_transaction` v1/v2

Fuente: supabase/migrations/ + comparación normalizada (raw/f4_body_comparison.json) contra producción (2026-09-03).

| Versión | Migración / Commit | Fecha | Fuente | Auth guard | WAC | Payments | Audit | Locking | search_path |
|---|---|---|---|---|---|---|---|---|---|
| V1 a | `20260726000005_v2_2_accounting_flow_reversal.sql` | 2026-07-26 | CREATE V1 (bug: pasa transaction_id como store_id a has_store_access_as) | has_store_access_as(p_user_id=erróneo) | stock directo products, kardex directo `devolution_in` uc=0 | NO reset | NO explícito | NO FOR UPDATE | (sin SET en CREATE original) |
| V1 b | `20260726000006_v2_3_production_reversal_and_validation.sql` | 2026-07-26 | Fix store_id + compuestos | has_store_access_as(v_tx.store_id) ✓ | ídem | NO | NO | NO | — |
| V1 c | `20260727000006_v2_12_9_spoofing_p_user_id.sql` | 2026-07-27 | Anti-spoofing: `auth.role()='service_role'→COALESCE(p_user_id,auth.uid()) ELSE auth.uid()` | ✓ no confía en p_user_id para callers no-service_role | ídem | NO | NO | NO | public |
| V1 d | `20260727000008_v2_12_12_fix_is_not_null_pattern.sql` | 2026-07-27 | Patrón `IS NULL OR NOT` | ✓ | ídem | NO | NO | NO | public |
| V1 e (ACL) | `20260727000009_v2_12_13_revoke_anon_grants_comments.sql` | 2026-07-27 | REVOKE anon; GRANT authenticated+service_role (sin body) | — | — | — | — | — | — |
| **V1 PRODUCCIÓN** | == **V1 d (V2.12.12)** body + ACL de C2 | — | idéntico normalizado | ✓ | directo, sin WAC | NO | solo trigger genérico `UPDATE_STATUS` | NO | `public` |
| V2 a | `20260808000001_v2_17_1_reverse_transaction_v2.sql` | 2026-08-08 | CREATE V2 (variantes, kardex directo `sale_reverse`, audit con old_status/payment_method) | ✓ mismo patrón | via register_stock_movement | NO | audit_logs | NO FOR UPDATE en esta versión | public, pg_temp |
| V2 b (PR-4) | `20260810000040_pr4_kardex_fix.sql` | 2026-08-10 | Elimina INSERT directo kardex; deja register_stock_movement→trg_auto_kardex; añade FOR UPDATE + idempotencia voided + restrictivo status='completed' | ✓ | pipeline single-writer (stock_movements) | NO | audit_logs `REVERSE_TRANSACTION_V2` | `FOR UPDATE` ✓ | public, pg_temp |
| **V2 PRODUCCIÓN** | == **V2 b (PR-4)** body + ACL de C2 | — | idéntico normalizado | ✓ | pipeline | NO | ✓ | ✓ | `public, pg_temp` |
| ACL final | `20260902200923_w9_f06_c2_hardening.sql` (commit 7b1bafc) | 2026-09-02 | REVOKE authenticated/anon/PUBLIC en ambas; GRANT service_role (V1 y V2) | — | — | — | — | — | — |

## Cadena de custody

- **V1**: 20260726000005 → 000006 → 27000006 → 27000008 (body final) → 27000009 (ACL) → W9 C2 (ACL final). **Ningún commit posterior tocó el body.**
- **V2**: 20260808000001 → 20260810000040 PR-4 (body final) → W9 C2 (ACL final). **Ningún commit posterior tocó el body.**
- Commits `1c204d1` (W7 consolidate) y `033e05d`/`7b1bafc` aparecen en `git log -S` porque consolidan/mencionan las migraciones o evidencia, no porque redefinan los cuerpos (verificado por comparación exacta).

## Veredicto de drift

**MIGRATION DRIFT: NO.** Producción == repo en ambos cuerpos (comparación normalizada whitespace-insensitive, ver raw/f4_body_comparison.json):
- `V1_live_vs_V2_12_12: identical=True (2593 chars)`
- `V2_live_vs_PR4: identical=True (2057 chars)`

Diferencia V2_live vs V2.17.1 original es esperada (PR-4 la sustituyó).

## Diferencias funcionales V1 vs V2 (estado final ambos en producción)

| Bloque | V1 | V2 |
|---|---|---|
| Status final tx | `reversed` (+reversed_at/reversed_by/reversal_reason) | `voided` (sin campos de reversión; razón solo en audit) |
| Transición | completed→reversed (válida) | completed→voided (válida) |
| Idempotencia | ERR_ALREADY_REVERSED / ERR_ALREADY_VOIDED | voided → success idempotente; solo `completed` reversible |
| Stock | UPDATE directo `products.stock_current` (+lots) **sin stock_movements ni inventory** | `register_stock_movement('sale_reverse')` → inventory + stock_movements + products via triggers |
| Kardex | INSERT directo `devolution_in` unit_cost=0 | auto-kardex `sale_reverse` unit_cost=cost_at_sale |
| WAC | no toca cost_average (guard no aplica) | no toca cost_average (A2 hotfix: register_stock_movement sin WAC) |
| Pagos | NO reset payment_transactions | NO reset payment_transactions |
| Audit | NO inserta audit_logs (solo trigger genérico `UPDATE_STATUS`) | INSERT audit_logs `REVERSE_TRANSACTION_V2` (+trigger genérico) |
| Locking | sin FOR UPDATE (race) | `FOR UPDATE` en transactions |
| search_path | `public` (pg_temp implícito primero; todas las refs cualificadas) | `public, pg_temp` (hardened H-1) |
| ACL | service_role + postgres | service_role + postgres |
