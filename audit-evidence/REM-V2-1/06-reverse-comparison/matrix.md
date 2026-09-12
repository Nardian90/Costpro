# REM-V2-1 — 06 COMPARACIÓN REVERSE V1 vs V2 (matriz con evidencia)

Parejas con variante real: receipt (reverse_receipt vs reverse_receipt_v2) y adjustment (reverse_adjustment vs reverse_inventory_adjustment_v2).
`transaction` ya resuelve a V2 en AMBOS mapas (V1 DROP con guard H5-B1). transfer/devolution/production_order comparten RPC moderna.

| Control | V1 receipt | V2 receipt | V1 adjustment | V2 adjustment |
|---|---|---|---|---|
| auth.uid enforcement | auth-pinned pero **bypass si uid NULL** (20260727000006:1464) | NULL ⇒ ERR_UNAUTHORIZED (H4:123) | `COALESCE(p_user_id, auth.uid())` **spoofable** | auth-pinned (B-10:11) |
| store isolation | saltada si uid NULL | estricta | saltada si uid NULL | estricta |
| role enforcement | ninguna | ninguna (guard de tienda; el API añade `can_reverse_document`) | ninguna | **`can_reverse_document(actor,store,'adjustment')`** |
| input validation | mínima | mínima | mínima | mínima |
| transaction atomicity | sí | sí | sí | sí |
| inventory integrity | UPDATE directo + clamp GREATEST(0,…) | recálculo con detección de negativo (ERR_WAC_REVERSE_NEGATIVE_STOCK) | UPDATE directo | register_stock_movement (capa única) |
| WAC integrity | **kardex a costo 0, sin tocar cost_average** (huérfano contable) | **fn_recalc_wac inverso exacto, single-writer token** (H4:140-143) | kardex a costo promedio sin ajuste WAC | vía register_stock_movement |
| idempotencia | status-check (TOCTOU teórico) | FOR UPDATE + status-check | sin guard explícito | FOR UPDATE + ERR_ALREADY_REVERSED |
| concurrency | sin locks | **receipts + products FOR UPDATE** | sin locks | FOR UPDATE |
| duplicate protection | status check | status check + lock | débil | status + lock |
| rollback/reversal | n/a (es la reversión) | n/a | n/a | n/a |
| audit trail | **sin audit_logs** | audit_logs REVERSE_RECEIPT_V2 + metadata | no | audit_logs |
| error handling | excepciones SQL crudas | contrato ERR_* tipado (API mapea 409/422) | crudo | contrato ERR_* |
| closed-document protection | estados reversed/voided rechazados | solo `active` reversible | débil | solo `confirmed` reversible |
| payment consistency | **no revierte pagos** | **reset payment_status + marca payment_transactions** | n/a | n/a |
| multi-store protection | heredada del guard V1 | estricta | débil | estricta |
| tests | sin cobertura específica | contract + evidencia H4 (raw snapshot + guards) | sin cobertura | contract B-10 |
| API usage | `/api/reverse` flag OFF | `/api/reverse` flag ON + **caller directo navegador** | flag OFF | flag ON |

**RESULTADO REVERSE**:
- `reverse_receipt_v2` > `reverse_receipt` en TODOS los controles críticos (locks, WAC single-writer, ledger de movimientos, pagos, auditoría, guard no-null). V1 es `API-ONLY` (service_role-only grant) accesible solo si el operador pone la flag en OFF.
- `reverse_inventory_adjustment_v2` > `reverse_adjustment` (rol normativo + auth-pinned + FOR UPDATE + single-writer). V1 `API-ONLY`.
- `transaction`: V1 ya retirada (DROP con guard) — el eje está cerrado.
- Compartidas (transfer/devolution/production_order): endurecidas en wave B-8/B-10/B-10b + f06_c2 — paridad entre mapas.

**Riesgo residual del dominio reverse** (independiente de V1/V2): caller directo de navegador a `reverse_receipt_v2` (bypassa boundary API: sin rate-limit/CSRF del API; la DB mantiene guardas de tienda pero NO `can_reverse_document` — cualquier miembro de la tienda puede revertir una recepción activa desde consola). Clasificado en 07-security.
