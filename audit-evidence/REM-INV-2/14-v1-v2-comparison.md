# REM-INV-2 — 14: COMPARACIÓN V1 vs V2/CANÓNICA (16 controles)

Candidata V2/canónica (demostrada en 03): **`receive_against_po` → `register_reception`** (+ `confirm_pending_reception` para el ciclo pendiente). Fuentes: definiciones reales de producción (`pg_get_functiondef`), interceptación dinámica (05) y staging aislado (06-13).

| # | Control | V1 `receive_purchase` | V2/Canónica | V2 ≥ V1 |
|---|---|---|---|---|
| 1 | `auth.uid()` | ❌ ausente (0 ocurrencias) | ✅ `auth.uid()`; `p_user_id` solo bajo `service_role` | PASS |
| 2 | Authorization | ❌ ninguna | ✅ `has_store_access_as` / `has_store_access` | PASS |
| 3 | Store isolation | ❌ sin guard propio (staging: forastero aceptado) | ✅ store validado + producto-en-store (B5) | PASS |
| 4 | Status guard | ❌ sobrescribe cualquier estado (staging: cancelled→received) | ✅ `ERR_PO_CANCELLED`, `ERR_PO_NOT_RECEIVABLE`, state machine `set_purchase_order_status` | PASS |
| 5 | Inventory mutation | ⚠️ upsert ciego de cantidad | ✅ escritor canónico `fn_recalc_wac` (single source of truth) | PASS |
| 6 | WAC | ❌ jamás actualiza; `unit_cost` nunca leído | ✅ `fn_recalc_wac('reception_in')`, doctrina W62-01 (WAC→movimiento) | PASS |
| 7 | Locking | ❌ sin `FOR UPDATE` | ✅ `FOR UPDATE` OC (receive_against_po) / receipt (confirm_pending) | PASS |
| 8 | Atomicity | ✅ transaccional (motor) | ✅ transaccional + orden deliberado de escrituras | PASS (igual+) |
| 9 | Idempotency | ❌ ×N aplica ×N | ✅ guards de estado + over-receive cap → ONE EFFECT | PASS |
| 10 | Concurrency | ❌ dos sesiones = double stock | ✅ serialización + guard → exactamente una recepción efectiva | PASS |
| 11 | Audit | ❌ nada (ni identidad) | ✅ `audit_logs 'po_received'` + created_by + receipt vinculado po_id + CxP unpaid | PASS |
| 12 | Validation | ❌ cero (confía en CHECKs de tabla) | ✅ B2 supplier, B3 items, B4 unit_cost>0, C1 tasa [0.01,10000], B5 producto-en-store, qty>0, over-receive | PASS |
| 13 | Error handling | ⚠️ excepciones crudas sin códigos | ✅ códigos `ERR_*` mapeados a HTTP por el route | PASS |
| 14 | Rollback | ✅ transacción única | ✅ transacción única | PASS (igual) |
| 15 | Observability | ❌ ninguna | ✅ códigos + audit + logging de route (`RECEIVE_TO_WAREHOUSE`-style) + metadata en audit_logs | PASS |
| 16 | Tests | ❌ 0 tests | ✅ contract tests (16/16 en baseline) + pins dinámicos permanentes de este gate | PASS |

**Resultado: 16/16 `V2 ≥ V1`** (14 superiores + 2 iguales: atomicity/rollback). La V2 es demostrablemente **EQUIVALENT OR BETTER** — y no un `NEWER NAME`: cada control se verificó contra definiciones reales y pruebas conductuales, no por nomenclatura.

Nota de honestidad metodológica: la V2 no es "una función llamada receive_purchase_v2"; es la familia canónica vigente (hardening v2.23.0–v2.24.0) que ya ejecuta la recepción real del producto (05). El protocolo prevé exactamente este caso (ESCENARIO B — equivalente canónico con evidencia concluyente).
