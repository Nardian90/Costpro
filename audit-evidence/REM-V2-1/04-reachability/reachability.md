# REM-V2-1 — 04 REACHABILITY ANALYSIS

Clasificación por función. Callers verificados en `src/` (excluyendo tests), API routes, scripts y migraciones.
"G live" = grants live @ REM-INV-1 r13 (mismo día del baseline). Sin consultas live nuevas (sin credenciales — ver 00-baseline).

## CHECKOUT

| Función/camino | Capa | UI | API | authenticated directo | service_role | Scripts/Jobs | Tests | Clasificación |
|---|---|---|---|---|---|---|---|---|
| `create_sale` (V1) | RPC | **SÍ — `SalesCatalogView` (useSalesCatalog:377)** | no | SÍ (grant) | SÍ | no | aserciones texto | **ACTIVE-LEGACY** (camino vivo que ignora la flag) |
| `POST /api/pos/checkout` → `create_sale_v2` | API+RPC | **SÍ — POS principal (flag ON)** | SÍ | SÍ (RPC PUBLIC live, F-06) | SÍ | `/api/sync/batch` | contract+integración | **ACTIVE** (V2 canónico) |
| `create_sale_v2` RPC directa | RPC | no (siempre vía API) | SÍ | **SÍ — ejecutable por authenticated/anon-PUBLIC** | SÍ | sync/batch | contract | **DANGEROUSLY-REACHABLE (PUBLIC live)** — guards internos mitigan |

## REVERSE

| Función/camino | Capa | UI | API | authenticated directo | service_role | Clasificación |
|---|---|---|---|---|---|---|
| `void_transaction` | RPC | **SÍ — POS undo (`useInvertDocument`)** | no | SÍ | SÍ | **ACTIVE-LEGACY** (Nivel 1 B-8, endurecida, pero PUBLIC live F-06) |
| `reverse_transaction_v2` | RPC | no (vía API) | SÍ (`/api/reverse`, ambos mapas) | no (service_role-only tras f06_c2) | SÍ | **ACTIVE** (V2) |
| `reverse_transaction` (V1) | RPC | — | — | — | — | **DEAD — DROP** con guard (H5-B1) |
| `reverse_receipt` (V1) | RPC | no | SÍ — solo flag OFF (`RPC_MAP_V1.receipt`) | no (service_role-only) | SÍ | **API-ONLY ACTIVE-LEGACY** (fallback latente activable por config) |
| `reverse_receipt_v2` | RPC | **SÍ — `useVoidReception` (RPC directo navegador)** | SÍ — flag ON | **SÍ (grant authenticated + PUBLIC live F-06)** | SÍ | **ACTIVE** (V2) + DANGEROUSLY-REACHABLE por PUBLIC live |
| `reverse_adjustment` (V1) | RPC | no | SÍ — solo flag OFF | no (service_role-only) | SÍ | **API-ONLY ACTIVE-LEGACY** |
| `reverse_inventory_adjustment_v2` | RPC | no | SÍ — flag ON | no (service_role-only) | SÍ | **ACTIVE** (V2) |
| `create_devolution` (V1) | RPC | no (vía API) | SÍ — solo flag OFF (`/api/devolutions:73`) | no (service_role-only live r13) | SÍ | **API-ONLY ACTIVE-LEGACY** — implicada en F-02 (overload sin movimientos) |
| `create_devolution_v2` | RPC | no (vía API) | SÍ — flag ON | no (service_role-only live) | SÍ | **ACTIVE** (V2) |
| `reverse_devolution` | RPC | no | SÍ (ambos mapas) | no (service_role-only) | SÍ | **ACTIVE** (modernizada B-10b; compartida) |
| `reverse_transfer` | RPC | no | SÍ (ambos mapas) | no (service_role-only) | SÍ | **ACTIVE** (compartida; sin variante v2) |
| `reverse_production_order` | RPC | no | SÍ (ambos mapas) | no (service_role-only) | SÍ | **ACTIVE** (compartida) |
| `void_closed_production_order` | RPC | no | SÍ (`/api/production-orders/[id]/void`) | SÍ (grant live) | SÍ | **ACTIVE** |
| `void_pending_reception` | RPC | **SÍ — `useVoidReception` (pending)** | no | SÍ | SÍ | **ACTIVE** (fuera del eje V1/V2) |
| `perform_inventory_adjustment` (composite inversión de recepciones) | RPC | **SÍ — `useInvertDocument` tipo reception** (loop ítems + UPDATE receipts directo) | no | SÍ | SÍ | **ACTIVE-LEGACY — DANGEROUS** (composición cliente no atómica: ajustes N + UPDATE de estado sin transacción) |
| `receive_purchase` (F-01) | RPC | no | no | **SÍ (grant live)** | SÍ | **DANGEROUSLY-REACHABLE** (sin guardas; 0 purchase_items hoy — latente) |
| `register_reception` / `confirm_pending_reception` | RPC | vía API receptions | SÍ | SÍ | SÍ | **ACTIVE** (familia recepciones vigente; PUBLIC live en register_reception según F-06 — mitigado con guards) |

## Callers activos resumen (ACTIVE CALLERS)

- CHECKOUT V1: 1 caller activo de UI (SalesCatalogView). CHECKOUT V2: POS (flag ON) + sync offline.
- REVERSE V1-mapeadas: 2 fallbacks API (receipt/adjustment flag OFF) + 1 devolution flag OFF.
- REVERSE V1-familia con caller directo: `void_transaction` (POS undo), composite `perform_inventory_adjustment` (inversión recepciones).
- REVERSE V2: `/api/reverse` (flag ON) + `useVoidReception`→`reverse_receipt_v2`.

## Referencias dinámicas / triggers / jobs

- Sin referencias dinámicas a las RPCs objetivo (`rpc(` siempre con literal string) — verificado por grep.
- Triggers que tocan el dominio (capa DB, comunes a V1/V2 vía register_stock_movement):
  `tr_sync_inventory_after_movement`, `trg_auto_kardex`, `trg_sync_products_stock_current`,
  `trg_validate_tx_transition` (2ª barrera de transición de estados de transactions).
- Jobs/crons: `telegram-cron-poller`, `whatsapp-cron-poller` (no llaman RPCs del dominio checkout/reverse).

## CONCLUSIÓN FASE 2

1. V2 no es alcanzable "bypassed": todos los caminos activos de checkout V2 y reverse V2 pasan por los mismos RPCs endurecidos; NO existe ruta que ejecute V1 cuando el flag está ON **excepto los callers directos listados** (SalesCatalog/create_sale, useInvertDocument/void_transaction, useVoidReception, composite recepciones) que **ignoran la flag por diseño**.
2. El fallback V1 en `/api/reverse` (receipt/adjustment) y `/api/devolutions` (create_devolution) es real y activable con flag OFF — con RPCs hoy service_role-only (mitigado), pero con menor calidad de controles que V2 (ver 05/06).
3. 3 funciones con EXECUTE a PUBLIC en live (create_sale_v2, reverse_receipt_v2, void_transaction) = superficie innecesaria (F-06 heredado).
4. `receive_purchase`: reachable por authenticated, sin DDL en repo, sin guardas — el mayor riesgo residual del dominio (F-01).
