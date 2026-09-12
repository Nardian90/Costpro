# 01 — V1/V2 COMPLETE CENSUS (PHASE 1)

Método: `rg` exhaustivo en `src/ supabase/ scripts/ docs/ e2e/` (sin limitarse a `src/`),
más censo de catálogo en PRODUCCIÓN vía Management API (solo SELECT: `pg_proc`, ACL,
`pg_get_functiondef`, scan de cuerpos de funciones, triggers). Sin búsquedas dinámicas de
nombres RPC (`reverse_${…}` / concatenación) — verificadas ausentes.

| V1 símbolo/RPC | Definición | Callers | Indirect callers | Tests | API path | UI path | Offline path | Dynamic refs | Estado |
|---|---|---|---|---|---|---|---|---|---|
| `RPC_MAP_V1.receipt` → `reverse_receipt` | DB prod (secdef, ACL postgres+service_role), migraciones 20260727000006/09 | route.ts:37 (map) | route.ts:164 bajo `USE_V2_REVERSE=false` (interceptación dinámica lo demostró PRE-retiro) | ninguno opera V1 | /api/reverse (fallback fail-closed) | useReverseDocument/useDocumentActions → /api/reverse | NINGUNO (offline solo create_sale_v2) | flag-env (P-1 la mantiene true) | REACHABLE-pre → RETIRADA (REM-V2-3) |
| `RPC_MAP_V1.adjustment` → `reverse_adjustment` | DB prod (secdef, ACL postgres+service_role), 20260727000006/09 | route.ts:39 (map) | ídem flag=false | ninguno | /api/reverse (fallback) | ídem | NINGUNO | flag-env | REACHABLE-pre → RETIRADA (REM-V2-3) |
| `void_transaction` | DB prod (secdef, **ACL authenticated+service_role**), firma (p_transaction_id, p_reason, p_operation_date, p_user_id) | **useDocumentActions.ts:75 (ACTIVO — client JWT)** | POS-2 MM-9 undo 30s (usePOSCheckout:316-347) + Invert venta | iteration-19 (ACL/ownership/pipeline canónico), iteration-rls PT-RLS.6.5 (pin no-modificar), iteration-11-3 (pin), iteration-11-1 C-7 | n/a (RPC directa cliente, no via /api/reverse) | Toast «Deshacer» 30s POS + Invert | n/a | ninguno | **REQUIRED — KEEP** |
| `reverse_transaction` (V1) | **DROP con guard H5-B1** (migración 20260903030000) | ninguno | ninguno (ambos mapas resuelven a V2) | contract test anti-resurrección | — | — | — | ninguno | RETIRED (precedente, verificado intacto) |
| `create_sale` (V1 checkout) | DB prod (secdef, ACL authenticated+service_role) | useTransactions.ts:119 `rpcName='create_sale'` (ONLINE directo con flag checkout OFF — fallback fail-closed) | usePOSCheckout (clásico) vía useCreateSale | contract test: allow-list pin «registro V1 permitido» | n/a (RPC cliente) | POS clásico | queue → sync/batch → **create_sale_v2** (V2) | flag-env | REACHABLE (fallback) — FUERA DE ALCANCE (no candidato de este gate; allow-list contractual) |
| `reverse_transfer` | compartida V1=V2 (sin refactor propio) | ambos mapas | — | — | /api/reverse | — | — | — | NO CANDIDATO (no es V1-only) |
| `reverse_devolution` | compartida V1=V2 | ambos mapas | — | — | /api/reverse | — | — | — | NO CANDIDATO |
| `reverse_production_order` | compartida V1=V2 | ambos mapas | — | — | /api/reverse | — | — | — | NO CANDIDATO |
| scripts legacy: test_reverse_all_live.mjs, test_reverse_e2e_full.mjs, test_adjustments_e2e.mjs | scripts manuales live | llamaban `reverse_receipt`/`reverse_adjustment` directamente | — | — | — | — | — | — | MIGRADOS a V2 (REM-V2-3, patrón R2 de H5-B1) |

Callers dinámicos de construcción de nombres RPC: **0** (sin `reverse_${`, sin concatenación, sin template en `rpc()`).
