# W9.4.7 — H5-B1 · FASE 3 — Historial de migraciones (`reverse_transaction`)

Fecha: 2026-09-03 · Repo HEAD: 24f89e44 · Fuente: `supabase/migrations/` (426 archivos; 8 mencionan reverse_transaction*)

## Cronología completa

| # | Migración | Versión | Acción sobre V1 | Acción sobre V2 | ACL resultante V1 |
|---|-----------|---------|-----------------|-----------------|-------------------|
| 1 | `20260726000005_v2_2_accounting_flow_reversal.sql` | V2.2 | **CREATE** `reverse_transaction(uuid,text,uuid)` (escritura directa a `products.stock_current`, `product_lots`, `kardex_entries`) | — | GRANT authenticated + service_role |
| 2 | `20260726000006_v2_3_production_reversal_and_validation.sql` | V2.3 | OR REPLACE — fix: pasaba `p_transaction_id` como `store_id` a `has_store_access_as` → ahora usa `v_tx.store_id` | — | (hereda) |
| 3 | `20260727000006_v2_12_9_spoofing_p_user_id.sql` | V2.12.9 | OR REPLACE — anti-spoofing: `v_uid := CASE WHEN auth.role()='service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END` | — | (hereda) |
| 4 | `20260727000008_v2_12_12_fix_is_not_null_pattern.sql` | V2.12.12 | OR REPLACE — patrón `IS NULL OR NOT` en guard de acceso → **versión viva actual en producción (OID 136653)** | — | (hereda) |
| 5 | `20260727000009_v2_12_13_revoke_anon_grants_comments.sql` | V2.12.13 | REVOKE anon / GRANT authenticated+service_role / COMMENT | — | anon=none, authenticated=X, service_role=X |
| 6 | `20260808000001_v2_17_1_reverse_transaction_v2.sql` | V2.17.1 | (no toca V1) | **CREATE** `reverse_transaction_v2` — pipeline `register_stock_movement` + `stock_movements` + kardex por trigger; GRANT authenticated+service_role | coexistencia inicia |
| 7 | `20260810000040_pr4_kardex_fix.sql` | PR-4.3 | (no toca V1) | OR REPLACE V2 — elimina double-writers, INSERT directo a kardex fuera del trigger | coexistencia |
| 8 | `20260902200923_w9_f06_c2_hardening.sql` | W9 F06-C2 | REVOKE authenticated, GRANT service_role (`[C2-A]`) | REVOKE authenticated+anon, GRANT service_role (`[C2-B]`) | **postgres=X, service_role=X (estado vivo actual, confirmado FASE 1)** |

## Hallazgos clave

- **Ninguna migración hace `DROP FUNCTION public.reverse_transaction`** — V1 nunca fue retirada del esquema; solo quedó sin consumidores tras V2.17.1 + flag `USE_V2_REVERSE`.
- Última escritura al cuerpo de V1: `20260727000008` (V2.12.12). Coincide byte-a-byte con producción (auditado en W9.4.6 — comparación normalizada `V1_live==V2.12.12`, sin drift).
- Último cambio de ACL de V1: `20260902200923` (W9.4 F06-C2): authenticated revocado; solo `postgres` y `service_role` tienen EXECUTE.
- **Motivo aparente de coexistencia**: V2.17.1 reescribió la reversión sobre el pipeline single-writer WAC (`stock_movements` → `auto_kardex_on_stock_movement`) para eliminar escritura directa a `products.cost_average`/`kardex_entries` (W7). V1 se mantuvo como fallback flag-OFF en vez de DROP inmediato → deuda H-5, hoy H5-B1.
- V1 históricamente GRANTeada a `authenticated` (migraciones 1 y 5) hasta el hardening W9 del 2026-09-02. En producción vivo la ACL ya está reducida a `{postgres, service_role}` (FASE 1: `postgres=X/postgres,service_role=X/postgres`).

## Conclusión FASE 3

El historial de migraciones **no registra dependencia operativa vigente de V1**: la última referencia es el REVOKE del hardening W9. La ausencia de DROP es exactamente la deuda que H5-B1 cierra.
