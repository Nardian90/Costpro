# REM-V2-1 — 02/03 CENSO FORENSE V1/V2 — CHECKOUT y REVERSE

Cadena de llamada reconstruida por lectura de código (UI → hook → client → API → RPC → DB → triggers).
RPCs de DB verificadas en `supabase/migrations/` (última definición por firma). ACLs live:
`audit-evidence/20260912-rem-inv-1/12-multistore/r13-grants.json` (mismo día que baseline).

## A. CHECKOUT

### A.1 V1 `create_sale` (UUID, uuid, numeric, jsonb, … 20 params, último DDL 20260803000004)

| Propiedad | Evidencia |
|---|---|
| Definición final | `20260803000004_v2_13_4_create_sale_validate_op_date.sql` (+C-7 conversion_factor 20260803000002) |
| SECURITY DEFINER + search_path | sí (`public, pg_temp`) |
| Identidad | `v_uid := CASE WHEN auth.role()='service_role' THEN COALESCE(p_user_id,auth.uid()) ELSE auth.uid() END` |
| Aislamiento tienda | `has_store_access_as(v_uid, p_store_id)` — no-null estricto |
| Idempotencia | SELECT por `idempotency_key` + **partial UNIQUE INDEX** `transactions.idempotency_key` (20260803000003, backstop DB anti-TOCTOU) |
| Validación de stock | **NINGUNA explícita** — delega en `register_stock_movement`; no hay FOR UPDATE; la protección negativa depende de constraints/triggers de `inventory` |
| Total/descuento/tax | **confía en el payload del cliente** (p_total_amount, p_subtotal, p_discount_*, p_tax_amount sin verificación aritmética) |
| Pagos | header `cash_amount/transfer_amount/zelle_amount` sin verificación de cuadre; **no escribe `payment_transactions`** |
| Costo (COGS) | `v_cost := COALESCE(cost_at_sale, cost, 0)` **del cliente** |
| Stock deducción | `register_stock_movement('sale', unit_cost=v_cost, skip_access_check=TRUE)` |
| Auditoría | `audit_logs` ('CREATE_SALE') |
| Reversibilidad asociada | `void_transaction` (POS undo, B-8) / `reverse_transaction_v2` (admin) |
| Grants repo | authenticated + service_role (REVOKE anon 20260803000004:152) |
| Grants live (r13) | no listada en subset r13; por herencia DDL sin REVOKE PUBLIC explícito posterior ⇒ riesgo PUBLIC latente (marcado UNKNOWN-live) |
| Callers activos | `useCreateSale` → `useSalesCatalog` (vista `sales_catalog` ACTIVA) |
| Tests | `iteration-*` (aserciones texto), sin E2E mutativo |

### A.2 V2 `create_sale_v2` (última def completa 20260810000070 pr4_4e + payments 20260812000002 pr4_4i)

| Propiedad | Evidencia |
|---|---|
| SECURITY DEFINER + search_path | sí (`public, pg_temp`) |
| Identidad | mismo patrón `v_uid` (auth.uid() pinned; p_user_id solo para service_role) |
| Aislamiento tienda | `has_store_access_as` no-null estricto |
| Idempotencia | SELECT + mismo partial UNIQUE INDEX (DB backstop compartido con V1) |
| Validación de stock | **SÍ: `inventory.quantity FOR UPDATE` (fallback products.stock_current FOR UPDATE) + ERR_INSUFFICIENT_STOCK**; skip para `is_service` (PR-4.4E) |
| Total/descuento/tax | **recalculados server-side** desde items + tax_configurations; `ERR_TOTAL_MISMATCH` si difiere del cliente |
| Descuentos ≥15% | **autorización de supervisor server-side** (`has_store_role_as(admin|manager)`) — `ERR_SUPERVISOR_REQUIRED/UNAUTHORIZED` |
| Pagos | `ERR_PAYMENT_MISMATCH` si cash+transfer+zelle ≠ total; **INSERT en `payment_transactions`** (ledger autoritativo, pr4_4i) |
| Costo (COGS) | `v_cost := COALESCE(cost_at_sale, cost, 0)` **del cliente** — idéntico a V1 |
| Stock deducción | `register_stock_movement` (single-writer) |
| Auditoría | `audit_logs` |
| Grants repo | authenticated + service_role; REVOKE anon (pr4_4e:351) |
| Grants live (r13) | **`=X/postgres` (PUBLIC) + authenticated + service_role** — F-06 REM-INV-1 (least-privilege violado; mitigado con guards internos) |
| Callers activos | `POST /api/pos/checkout` (flag ON) + `/api/sync/batch` (offline, siempre V2) |
| Tests | contract tests seguridad (security-contract-test.cjs) + aserciones integración |

## B. REVERSE

### B.1 Mapa de RPCs por tipo de documento (`/api/reverse/route.ts:35-52`)

| tipo | RPC_MAP_V1 (flag OFF) | RPC_MAP_V2 (flag ON) | ¿Difiere? |
|---|---|---|---|
| transaction | `reverse_transaction_v2` | `reverse_transaction_v2` | NO — V1 `reverse_transaction` fue **DROP** (H5-B1, 20260903030000, con guards de firma/owner/secdef/ACL) |
| receipt | **`reverse_receipt`** (V1) | `reverse_receipt_v2` | SÍ |
| transfer | `reverse_transfer` | `reverse_transfer` | NO (compartida) |
| adjustment | **`reverse_adjustment`** (V1) | `reverse_inventory_adjustment_v2` | SÍ |
| devolution | `reverse_devolution` | `reverse_devolution` | NO (modernizada B-10b) |
| production_order | `reverse_production_order` | `reverse_production_order` | NO |

Boundary de autorización del API (para ambos mapas): `can_admin_reverse_transaction` (transaction) /
`can_reverse_document(actor, store, type)` (5 restantes) + withAuth + CSRF + rate-limit 5/min.

### B.2 Comparación de las parejas con variante V1/V2

| Propiedad | `reverse_receipt` (V1; def 20260727000006) | `reverse_receipt_v2` (def 20260902231200 H-4) |
|---|---|---|
| Bloqueo | sin FOR UPDATE (TOCTOU doble-reversal teórico; mitigado por status check) | **`receipts FOR UPDATE` + `products FOR UPDATE` por ítem** |
| Identidad | v_uid; **si uid NULL ⇒ se salta el check de tienda** (patrón bypass-auth) | v_caller_uid; **NULL ⇒ ERR_UNAUTHORIZED** (guard restaurado H-4) |
| Estado | rechaza `reversed`/`voided` | rechaza todo lo que no sea `active` |
| Stock | `UPDATE products.stock_current` directo + clamp `GREATEST(0,…)` (puede ocultar negativo) | stock recalculado por fn_recalc_wac; **ERR_WAC_REVERSE_NEGATIVE_STOCK si S+q<=0 (detección, no silencio)** |
| WAC/kardex | kardex directo con unit_cost=0 (valor huérfano), sin tocar cost_average | **fn_recalc_wac 'reception_reverse' inverso exacto (single-writer, token wac_writer)** |
| Ledger movimientos | **no escribe stock_movements** | **INSERT stock_movements 'purchase_reverse'** (capa auditoría completa) |
| Pagos | **no revierte pagos** | reset `payment_status='unpaid'`, `paid_amount=0`, marca `payment_transactions` '[REVERSED by …]' |
| Auditoría | sin audit_logs | **audit_logs 'REVERSE_RECEIPT_V2'** con metadata |
| Atomicidad | 1 RPC = 1 transacción (pero sin locks) | ídem + locks |
| Grants | repo: service_role (f06_c2) — **live r13: `postgres=X,service_role=X`** | repo: authenticated+service_role — **live r13: `=X/postgres` (PUBLIC) + authenticated + service_role** (F-06) |
| Callers | solo `/api/reverse` flag OFF (service_role server-side) | `/api/reverse` flag ON + **`useVoidReception` directo del navegador** |

| Propiedad | `reverse_adjustment` (V1; 20260726000008) | `reverse_inventory_adjustment_v2` (20260905000002 B-10) |
|---|---|---|
| Identidad/tienda | `v_uid=COALESCE(p_user_id, auth.uid())` — **spoofable p_user_id**; check saltado si NULL | v_caller_uid auth-pinned; NULL ⇒ ERR |
| Política de rol | **ninguna** (cualquier authenticated con grant) | `can_reverse_document(actor, store,'adjustment')` |
| Estado | check `reversed` implícito? (sin guard explícito de status en def V1) | **FOR UPDATE + rechaza ≠ `confirmed`, guard `ERR_ALREADY_REVERSED`** |
| Escritura | UPDATE products.stock_current + kardex directo | **register_stock_movement** (single-writer) + status → `reversed` |
| Auditoría | no | audit_logs |

| Propiedad | `void_transaction` (POS undo, def 20260905000001 B-8) | `reverse_transaction_v2` (admin, def 20260905000001) |
|---|---|---|
| Rol en Modelo C | Nivel 1 — undo propio del vendedor | Nivel 2 — reversión administrativa |
| Política | `can_pos_undo_transaction`: venta propia + ventana 30s + rol POS en tienda | `can_admin_reverse_transaction`: admin global o admin/manager/encargado de la tienda |
| Locks / estado | FOR UPDATE; solo `completed` (B-9a) | FOR UPDATE; `voided` ⇒ **idempotente** (return 'idempotent'); solo `completed` |
| Escritura | register_stock_movement 'sale_void' (unit_cost=cost_at_sale) | register_stock_movement 'sale_reverse' (unit_cost=cost_at_sale) |
| Auditoría | audit_logs 'VOID_SALE' | audit_logs 'REVERSE_TRANSACTION_V2' |
| Grants | authenticated + service_role (repo); **live: `=X/postgres` PUBLIC** (F-06) | service_role (f06_c2:287) — API-only |

### B.3 Historial de retiro ya ejecutado (precedente interno)

- `reverse_transaction` (V1) — **DROP forense** con GUARD (firma exacta, owner, SECURITY DEFINER,
  ACL post-f06) + definición archivada con hash SHA-256 + idempotencia + NOTICE. Es el patrón
  de retiro aceptado en este repo (H5-B1) y el template para FASE 10 de este gate.

## C. Otras RPCs del dominio (referencia)

- `void_pending_reception` (pending, PR-3, atómica, grants authenticated+service_role) — caller directo del navegador (`useVoidReception`).
- `void_closed_production_order` (20260911000100 REM-PO-1 boundaries) — API server-side.
- `reverse_transfer` / `reverse_devolution` / `reverse_production_order` — compartidas por ambos mapas; fuera de la comparación V1/V2 (no tienen variante v2 activa), cubiertas por los endurecimientos B-8/B-10/B-10b y f06_c2 (service_role-only).
- `receive_purchase` (F-01 REM-INV-1): **sin definición en repo** (solo catálogo live), grants live `postgres,authenticated,service_role` ⇒ **DANGEROUSLY-REACHABLE** por authenticated; guardas ausentes (doble recepción). Tratada en FASE 11.
