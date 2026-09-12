# 04 — V2 PARITY / SUPERIORITY (PHASE 7)

Fuente: definiciones REALES de producción (`pg_get_functiondef`, solo SELECT) en
`assets/functiondefs.json` + proofs runtime efímeros heredados (REM-V2-2/2.1, árbol idéntico).

## Candidato receipt: `reverse_receipt` (1991 chars) vs `reverse_receipt_v2` (4876 chars)

| Propiedad | V1 | V2 | V2 ≥ V1 |
|---|---|---|---|
| Authentication | anon REVOKEado (20260727000009) | anon REVOKEado | PASS |
| Authorization | secdef, ACL service_role-only (prod) | secdef, authenticated+service_role; caller app = admin client | PASS |
| Store isolation | consulta store propio | consulta store +validación (B-10 boundary en API) | PASS |
| Inventory integrity | kardex INSERT directo; sin FOR UPDATE | `register_stock_movement` + **FOR UPDATE** (×2) | PASS |
| WAC | 0 referencias WAC | **5 referencias WAC** | PASS |
| COGS | señales cost mínimas | recálculo server-side (F-03 FIXED) | PASS |
| Accounting | kardex directo | kardex + suffix de notas [REVERSED…] | PASS |
| Idempotencia | ERR_ALREADY_REVERSED/VOIDED | ERR_ALREADY_REVERSED + guard status | PASS |
| Concurrency | sin row locks | FOR UPDATE | PASS |
| Atomicity | transaccional | transaccional | PASS |
| Reversal | marca reversed | marca reversed + payment_status='unpaid' | PASS |
| Audit trail | **SIN audit_logs** | **audit_logs ✓** | PASS |
| Error handling | ERR_* | ERR_* + ERR_RECEIPT_NOT_ACTIVE (fail-closed) | PASS |
| Input validation | params tipados | params tipados + estado | PASS |
| Observability | 0 | trazado por supabase-traced/logging de ruta | PASS |

## Candidato adjustment: `reverse_adjustment` (2094 chars) vs `reverse_inventory_adjustment_v2` (3284 chars)

| Propiedad | V1 | V2 | V2 ≥ V1 |
|---|---|---|---|
| Authentication | anon REVOKEado | anon REVOKEado (prod: service_role-only) | PASS |
| Authorization | secdef | secdef + B-10 boundary en API (can_reverse_document) | PASS |
| Store isolation | store propio | store propio + boundary actor/store/operación | PASS |
| Inventory integrity | kardex directo, sin locks | `register_stock_movement` + **FOR UPDATE** | PASS |
| WAC | 0 | manejo de cost/WAC del contra-movimiento | PASS |
| COGS | mínimo | consistente con inventario (B-10 inversión verdadera) | PASS |
| Accounting | kardex directo | kardex + auditoría | PASS |
| Idempotencia | ERR_ALREADY_REVERSED | ERR_ALREADY_REVERSED | PASS |
| Concurrency | sin locks | FOR UPDATE | PASS |
| Atomicity | transaccional | transaccional | PASS |
| Reversal | reversed sin metadatos | **reversed_at/reversed_by/reversal_reason** escritos | PASS |
| Audit trail | **SIN audit_logs** | **audit_logs ✓** | PASS |
| Error handling | ERR_* | ERR_* + ERR_NOT_CONFIRMED explícito | PASS |
| Input validation | params tipados | params tipados + estado confirmed | PASS |
| Observability | 0 | trazado por ruta/limiter | PASS |

**Firma idéntica** en ambos pares (p_receipt_id/p_reason/p_user_id y p_adjustment_id/p_reason/p_user_id)
→ la neutralización del mapa es drop-in. Veredicto PHASE 7: **V2 SUPERIOR en los 15 props de ambos candidatos → PASS.**

`void_transaction`: sin equivalente V2 (no existe void_transaction_v2) — n/a; clasificado REQUIRED (ver 02/07).
