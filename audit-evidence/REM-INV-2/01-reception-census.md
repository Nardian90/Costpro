# REM-INV-2 — 01: CENSO COMPLETO DE RECEPCIÓN DE COMPRAS

**Alcance**: F-01 de REM-INV-1 — defecto de doble recepción asociado a la RPC V1 `receive_purchase`.
**Baseline**: `90dce25f` (HEAD == origin/main, worktree limpio).
**Método**: búsqueda exhaustiva en código vivo (src/, app/, hooks/, services/, stores/, supabase/, scripts/, e2e/, docs/, knowledge/) + catálogo DB de producción vía Management API (solo SELECT).

## 1. Símbolo auditado: `receive_purchase`

| Dimensión | Resultado |
|---|---|
| Definición en prod | SÍ — `public.receive_purchase(p_purchase_id uuid) RETURNS void` |
| Seguridad | `SECURITY INVOKER` (secdef=False), `search_path = public, extensions` |
| `auth.uid()` | **AUSENTE** — 0 verificaciones de identidad |
| `p_user_id` | **AUSENTE** — firma de 1 solo parámetro (`p_purchase_id`) |
| `p_store_id` | **AUSENTE** — el store se deriva de la fila `purchase_orders` |
| Status checks | **AUSENTE** — no verifica `status` de la OC antes de recibir |
| Stock mutation | SÍ — upsert ciego en `inventory` (`quantity + r.quantity`) |
| Movement creation | SÍ — insert en `stock_movements` sin `unit_cost`, sin `created_by` |
| WAC / cost_average | **NO TOCADO** — `unit_cost` de `purchase_items` jamás se lee |
| Audit | **AUSENTE** — 0 writes en `audit_logs`, 0 identidad registrada |
| Idempotency | **AUSENTE** — sin key, sin unique constraint, sin guard de estado |
| Locks | **AUSENTE** — sin `FOR UPDATE` |
| Triggers que la invocan | 0 (censo `pg_trigger` completo) |
| Callers internos DB | **0** — barrido `pg_proc.prosrc` exacto: ninguna función la referencia |
| Dependencias (pg_depend) | **0** — ninguna vista/regla/objeto depende de ella |
| Callers en código vivo | **0** — `rg receive_purchase` fuera de audit-evidence = 0 hits |
| En RPC maps | **AUSENTE** — RPC_MAP_V1 y RPC_MAP_V2 de `/api/reverse` no la contienen |
| Docs / knowledge | **0 referencias** |
| e2e / scripts / tests | **0 referencias** (pre-gate) |
| EXECUTE (ACL prod) | `postgres=X, authenticated=X, service_role=X` — **llamable directamente por cualquier usuario autenticado** |
| Tabla que consume | `purchase_items` (tabla LEGACY) — `receive_purchase` es la **única** función de toda la DB que la referencia |
| Filas de `purchase_items` en prod | **0** |
| Distribución de `purchase_orders` en prod | 8 OCs, todas en store E2E2-ALPHA (5 cancelled, 1 draft, 2 received); ENERVIDA y PUERTO PADRE: **0 OCs** |
| `stock_movements` con `reference_id` de OC | **0** — la ruta V1 nunca produjo movimientos en prod |

## 2. Superficie canónica de recepción (código vivo)

| # | Ruta | Componente/Archivo | RPC/Operación | Estado |
|---|---|---|---|---|
| 1 | Recepción directa (UI) | `useRegisterReception` (src/hooks/api/useInventory.ts:101) → `supabase.rpc` | `register_reception` (firma C, 7 params TIMESTAMPTZ) | ACTIVE |
| 2 | Recepción directa online | mismo hook, `navigator.onLine` | `register_reception` | ACTIVE |
| 3 | Recepción offline (encolada) | `addToQueue('reception','CREATE')` → SyncEngine → `/api/sync/batch` (FIX C-4) → case `reception` | `register_reception` con `p_user_id` de sesión servidor | ACTIVE (replay) |
| 4 | Endpoint legacy de sync | `POST /api/inventory/receptions` (REC-2 MM-R7) | `register_reception` | ACTIVE (cobertura offline histórica) |
| 5 | Recepción contra OC | `ReceiveAgainstPOModal` → `useReceiveAgainstPO` → `POST /api/purchase-orders/[id]` (postHandler) | `receive_against_po` | ACTIVE |
| 6 | Recepción pendiente → confirmación | `useReceptionState` / `useReceptionsHistoryView` → `useConfirmPendingReception` | `confirm_pending_reception` | ACTIVE |
| 7 | Creación de recepción pendiente | `useReceptions.ts` (~línea 296) — insert cliente `receipts(status='pending')` + `receipt_items` | INSERT directo en tablas (RLS) | ACTIVE |
| 8 | Edición de items | `PATCH /api/inventory/receptions/[id]` | `update_reception_items` | ACTIVE |
| 9 | Anulación con reversión | (hooks/ops) | `void_reception_with_reversal` | ACTIVE (ACL service_role) |
| 10 | Anulación de pendiente | (hooks/ops) | `void_pending_reception` | ACTIVE |
| 11 | Recepción a almacén (lotes) | `POST /api/receive-to-warehouse` | `receive_to_warehouse` | ACTIVE (ACL service_role) |
| 12 | Productos para recepción (lookup) | UI recepción | `get_products_for_reception` | ACTIVE |
| 13 | Fallback V1 `receive_purchase` | — | — | **NO EXISTE NINGUNA RUTA** |

## 3. RPC maps y feature flags

- `RPC_MAP_V1` / `RPC_MAP_V2` (src/app/api/reverse/route.ts:39/49): contienen SOLO rutas de reversión (`receipt`, `adjustment`, `transfer`, `devolution`, `production_order`). **No existe ningún mapa para recepción** — no hay ramas V1/V2 de recepción en el código.
- Flags V2 existentes: `NEXT_PUBLIC_USE_V2_CHECKOUT=true` (checkout), `NEXT_PUBLIC_USE_V2_REVERSE=true` (reversión). **Ninguna gobierna recepción.** No existe flag de recepción V2 ni la necesita: la implementación canónica actual no tiene predecesora conmutable en el código.

## 4. Tablas del dominio (prod, censo SELECT-only)

| Tabla | Filas | Uso |
|---|---|---|
| `purchase_orders` | 8 (todas en store E2E) | Estado actual de OCs — usada por V1 y por el flujo canónico |
| `purchase_items` | **0** | Tabla LEGACY — solo `receive_purchase` la referencia |
| `purchase_order_items` | 9 | Modelo vigente — usada por `receive_against_po` |
| `receipts` | 63 (todas status='active') | Recepciones canónicas |
| `receipt_items` | (asociadas a receipts) | Items de recepción canónica |
| `receipt_tasa_audit` | — | Auditoría F-21 de tasas |

## 5. Conclusión del censo

`receive_purchase` es un **orfén V1 del modelo legacy** (`purchase_items`, hoy con 0 filas): sin callers de aplicación, sin callers internos en DB, sin triggers, sin dependencias, sin menciones documentales. Su única superficie viva es el **EXECUTE directo** otorgado a `authenticated`. La recepción real de compras corre íntegramente por la familia canónica `register_reception` / `receive_against_po` / `confirm_pending_reception` (detalle en 03-v2-candidate-census.md).
