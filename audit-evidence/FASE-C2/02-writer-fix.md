# FASE C — C2 · 02 WRITER FIX (C2-A)

## Qué se verificó antes de editar

- Esquema LIVE de `cost_sheets` re-confirmado (2026-09-23): `id, name, description, category, data, created_by, created_at, updated_at` — **sin store_id** (probe 42703 reproducido en C1R y re-confirmado en este gate).
- El writer anterior: wrapper `withStoreAccess` (400 «Se requiere storeId» sin tienda), Zod exigía `store_id` (400), insert con `store_id` (500 `42703`), verificación de membresía huérfana (403 posible), INSERT siempre (duplicados), `created_by: session.user.id` (correcto — se conserva).

## Qué se implementó

### 1. Contrato del writer (`costSheetSaveSchema`)
```ts
{ updateData, currentData?, id?: uuid, source: 'ai'|'manual' = 'ai' }
```
- Sin `store_id`/`storeId` (D1/C2-E). El OpenAPI se regenera automáticamente.

### 2. Ruta (`/api/cost-sheets/save`)
- **Wrapper**: `withAuth` (sesión + enriquecimiento RBAC). `withStoreAccess` eliminado: exigía un storeId que la tabla nunca registra. La autorización REAL queda en RLS (`cost_sheets_owner_manage`) + ownership explícito.
- **CREATE** (sin `id`): INSERT con `{name, description, category, data, created_by: session.user.id}` — solo columnas reales; `created_by` del contexto autenticado, NUNCA del cliente (§6).
- **UPDATE** (con `id`): (a) fetch owner-scoped `.eq('id').eq('created_by')` → 404 si el documento no existe o es ajeno; (b) **guard D3**: si el destino no es `isCostSheetDocument` → **409** (un documento FC o una semilla NUNCA se sobrescriben desde este writer); (c) UPDATE owner-scoped (mismo doble `.eq`), sin tocar `created_by`.
- **Metadata honesta**: `generatedBy: 'CostSheet Editor'` (manual) / `'Darian AI'` (IA) según `source`.
- **Respuesta**: `{ok, created, message, id, data}` — el cliente fija el vínculo `persistedDocId` con el `id` real.

## Evidencia

| Verificación | Resultado |
|---|---|
| E2E CREATE vía la ruta real (JWT de usuario, HTTP) | `200 {ok:true, created:true}` — fila creada SIN store_id |
| E2E UPDATE (mismo id) | `200 {created:false}` — total de filas se mantiene 9 (sin duplicado); nombre actualizado |
| E2E UPDATE de FC ajeno | 404 (`COST_SHEET_NOT_FOUND`) |
| E2E UPDATE de FC propio | 409 (`COST_SHEET_NOT_COMPATIBLE`) — fila byte-intacta |
| Unit: insert payload | sin `store_id`; `created_by = session.user.id` |
| Unit: update double-ownership | `.eq('id') + .eq('created_by')` en fetch Y update |
| RLS | sin cambios; todas las operaciones con JWT de usuario (nunca service role para escribir) |

Detalles de ejecución: `scripts/fasec2-e2e.py` → `fasec2-e2e-results.json` (fuera del repo). Tests: `src/__tests__/api/cost-sheets-save.test.ts`.

## Archivos afectados
`src/validation/api-schemas.ts` · `src/app/api/cost-sheets/save/route.ts` · `src/lib/api-errors.ts` · `src/lib/cost-sheets/document-compatibility.ts` (guard) · `src/components/views/terminal/views/cost_sheet/DarianEditor.tsx` (caller IA) · `src/hooks/logic/useCostSheetActions.ts` (caller manual)

## Limitaciones
- El motor de cálculo (`buildEngineFicha`+`calculateFicha`) se conserva tal cual (comportamiento preexistente del route, no es objeto de C2).
- No existe ruta DELETE/duplicar en el terminal (preexistente; fuera de alcance C2).
