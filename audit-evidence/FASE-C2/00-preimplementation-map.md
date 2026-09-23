# FASE C — C2 · 00 PRE-IMPLEMENTATION MAP (mapeo antes de editar — GATE 1)

Fecha: 2026-09-23 · Baseline `bbb74f4c` (HEAD == origin/main, verificado) · Objetivo del mapa: localizar EXACTAMENTE cada superficie a tocar antes de editar nada. Verificación FC.html: solo constatar que permanece intacto (no se edita).

## 1. CostSheet — superficies mapeadas

### 1.1 Contrato y validación

| Pieza | Archivo | Estado actual |
|---|---|---|
| `CostSheetDataContract` (TS) | `src/contracts/cost-sheet.ts` (types en `src/types/cost-sheet.ts:131`, `id?` opcional en raíz) | Sin cambios |
| Zod de documento (apertura) | `src/validation/schemas.ts:798-885` — `costSheetHeaderSchema` (code/name/date/quantity/currency/category/type/unit requeridos), `costSheetRowSchema` (passthrough), `costSheetSectionSchema`, `costSheetAnnexSchema` (passthrough), `costSheetSignatureSchema` (ambos requeridos), `costSheetDataSchema` (raíz SIN passthrough: header+sections+annexes+signature+scenarioConfig?+scenarios?) | **Sin cambios** (es la puerta de apertura — setSheet) |
| Zod del writer | `src/validation/api-schemas.ts:84-90` — `costSheetSaveSchema = {updateData, currentData?, store_id: uuidLoose (REQUERIDO, FIX-AUDIT-2), storeId?}` | **A CORREGIR (C2-A)**: quitar store_id/storeId; añadir `id?` (update) y `source` ('ai'\|'manual') |
| OpenAPI | `src/lib/api-docs/openapi-spec.ts:265` — `CostSheetSaveRequest: zodToOpenApi(costSheetSaveSchema)` (auto-generado del Zod) | Se corrige solo al cambiar el Zod |

### 1.2 Store y editor

| Pieza | Archivo | Estado actual |
|---|---|---|
| Store zustand | `src/store/cost-sheet-store.ts` — `data: CostSheetData`, `validatedSet` (94-107: safeParse→toast), `setSheet`/`loadExample`/`reset` vía validatedSet; persist `cost-sheet-storage` v5 | **A EXTENDER (C2-C/§8)**: `persistedDocId: string \| null` + `setPersistedDocId`; validatedSet lo limpia (documento nuevo/ajeno → sin id) |
| Editor Darian (IA) | `src/components/views/terminal/views/cost_sheet/DarianEditor.tsx:163-184` — `handleApplyUpdate` → POST `/api/cost-sheets/save` `{updateData, currentData: sheetData}` (sin store_id → hoy 400) → `setSheet(result.data)` | **A AJUSTAR (C2-A/§8)**: incluir `id` del store (evitar duplicados en re-aplicaciones) + `setPersistedDocId(result.id)` tras guardar. IMPORTA `useCostSheetStore` (línea 8) — ya disponible |

### 1.3 Writer / API

| Pieza | Archivo | Estado actual |
|---|---|---|
| Save route | `src/app/api/cost-sheets/save/route.ts` — wrapper `withStoreAccess` (exige storeId → 400 si falta, `auth-middleware.ts:299-341`), membresía huérfana (51-56), merge updateData→currentData/template, recálculo (`buildEngineFicha`+`calculateFicha`), snapshot metadata, **INSERT siempre** con `store_id` (201-213 → 42703/500), `created_by: session.user.id` ✓ | **A CORREGIR (C2-A)**: `withAuth` en lugar de `withStoreAccess`; sin membresía huérfana; sin store_id; UPDATE opcional cuando llega `id` (`.eq('id').eq('created_by')` — ownership §6); `generatedBy` según `source` |
| Único llamador HTTP del writer | `DarianEditor.tsx:166` (flujo IA). El botón manual NO llama al writer hoy (export) | Confirmado |

### 1.4 Acciones y navegación (C2-C)

| Pieza | Archivo | Estado actual |
|---|---|---|
| Acciones | `src/hooks/logic/useCostSheetActions.ts` — `handleExportJSON` (225-246, Blob/download), mapeo `tool-save → handleExportJSON` (263) | **A CORREGIR (C2-C)**: nuevo `handleSaveToSupabase` (validación + POST + feedback + id + guard doble-click); `tool-save` queda = export; nuevo `tool-save-cloud` = persistencia |
| Barra del módulo | `CostSheetModuleNav.tsx:151-159` — botón "Guardar Ficha" (`fichaContext.onSave`, aria-label "descarga…JSON", muestra "Guardando…" con el isSaving del autosave LOCAL) | **A CORREGIR (C2-C)**: onSave → persistencia real; aria-label honesto; isSaving = estado de persistencia real; añadir botón "Exportar JSON" explícito |
| Vista principal | `CostSheetView.tsx:504-512` (fichaContext.onSave=handleExportJSON, isSaving del autosave local) y `:595` (CostSheetNav onSave=handleExportJSON — etiqueta del dropdown es "Exportar", honesta) | **A AJUSTAR**: fichaContext.onSave → persistencia; CostSheetNav/dropdown mantiene export JSON |
| Paleta | `src/config/navigation/navigation-definition.ts:840-849` — `tool-save` "Guardar ficha (JSON)"; `navigation-map.ts:103` ruta; `view-tips.ts:32` tip | **A CORREGIR (C2-C)**: tool-save → "Exportar JSON" (honesto); nuevo `tool-save-cloud` "Guardar Ficha" |
| Test de navegación | `src/__tests__/navigation/gate1-navigation.test.ts:531` — `byKeyword('guardar ficha')` contiene `tool-save` | **A ACTUALIZAR** a la nueva semántica (tool-save-cloud) |
| Autosave local | `useAutoSave` (isSaving de snapshots locales — NO persistencia) | Sin cambios (deja de alimentar el botón Guardar) |

### 1.5 Lectores de `cost_sheets` (C2-B) — censo completo `from('cost_sheets')`

| # | Superficie | Archivo | Estado | Acción |
|---|---|---|---|---|
| 1 | Hook biblioteca | `src/hooks/api/useCostSheets.ts:21` — `select('*')` sin filtro (consumidor vivo: solo widget muerto) | Riesgo latente | **FILTRAR** (server-side + guard central) |
| 2 | ArenaFC | `src/components/views/terminal/views/cost_sheet/ArenaFC.tsx:254-299` — select todas → dedup por nombre → `calculateTemplate(sheetData)` sobre CADA doc (FC incluido → `values['5']` indefinido) | **ÚNICO MEZCLADOR ACTIVO** | **FILTRAR** |
| 3 | AI search | `src/lib/ai/tools/registry.ts:140-158` — `search_entity('costSheet')` → `.eq('store_id')` sobre columna inexistente (42703 en cada llamada) | **ROTO** | **CORREGIR + FILTRAR** (nunca a ciegas) |
| 4 | Writer | save/route.ts:202 | Roto (C2-A) | (C2-A) |
| 5 | Widget muerto | `src/components/views/terminal/views/dashboard/RecentCostSheets.tsx` (desmontado desde 2026-03-03; su test `multi-tienda-views.test.tsx` pasa en baseline: 5 passed/2 skipped) | Sin efecto vivo | Sin cambios (documentado) |
| 6 | FC.html | `public/fc/FC.html` — sync propio con guard `v(e)` | Correcto (lado FC ya aísla) | **NO TOCAR** |
| 7 | costOverview (IA) | `registry.ts:74-86` — usa `product_cost_sheets` (OTRA tabla, store-scoped, correcto) | Correcto | Sin cambios |

### 1.6 Infraestructura de verificación

| Pieza | Detalle |
|---|---|
| Tests | vitest (`npm run test`), config `vitest.config.ts` (include `src/**/*.test.{ts,tsx}`); patrón de mocks de rutas API en `src/__tests__/api/fc-invalidate.test.ts` (vi.mock auth-middleware/supabase) |
| TypeCheck | CI: `bunx tsc --noEmit` (`.github/workflows/ci.yml:45`) |
| Lint | `npm run lint` (eslint) |
| Build | `npm run build` (next build) — OOM conocido del entorno (C0/FASE-B): si 137 → BUILD = ENVIRONMENT LIMITATION + CI |
| Servidor | PM2 `costpro` online (bun server.ts) — permite E2E real; `getServerSession` acepta `Authorization: Bearer <JWT Supabase>` (`src/lib/auth.ts:27-52`) → las rutas API se pueden ejercitar con JWT real sin cookies |
| Cuenta de prueba | `admin@demo.com` (usada por C0/C1/C1R para probes RLS) |

## 2. FC.html — verificación de intangibilidad (GATE 1, solo lectura)

| Elemento | Estado en baseline |
|---|---|
| `data.model="FC_RES148_2023_V1"` (escritor) | 1 ocurrencia en bundle (el POST de sync) — presente |
| Guard de lectura `v(e) = data.ficha.id` | Presente |
| `category:"FC Res148"` | Presente (POST) |
| Service worker | `public/fc/sw.js` (`costpro-release-12.10.0-fc.3`, neverCache supabase) + registro en bundle |
| Guest/offline | `FC_GUEST_MODE_V1` + `?guest=1` en wrapper |
| `git diff -- public/fc/` | **VACÍO** (intacto) |

**Compromiso C2**: cero ediciones en `public/fc/`; al cierre, `git diff -- public/fc/` debe seguir vacío (§19).

## 3. Discriminador y función central (diseño acordado con C1R)

- Señales FC (C1R doc 02 §3): `data.model === "FC_RES148_2023_V1"`, `data.ficha` presente, `category === "FC Res148"`, `meta2.app === "FC"`.
- Pilares CostSheet: `header` + `sections` + `annexes` + `signature` (todos requeridos por contrato).
- Función central NUEVA: `src/lib/cost-sheets/document-compatibility.ts` → `isCostSheetDocument(data)`: rechaza no-objetos/vacíos, rechaza las 3 señales FC, exige los 4 pilares. Determinista, testeable. La validación Zod completa sigue siendo la puerta de APERTURA (setSheet) — capas: query (exclusión server-side best-effort) → guard central (lectores) → Zod (apertura).
- Filtro PostgREST a validar empíricamente (GET only) antes de implementar: `.or('data->>model.is.null,data->>model.neq.FC_RES148_2023_V1')` + `.filter('data->ficha','is',null)`.

## 4. Plan de implementación (orden)

1. **C2-A**: `api-schemas.ts` (schema) → `save/route.ts` (withAuth, sin store_id, create/update, source)
2. **C2-B**: `document-compatibility.ts` → `useCostSheets.ts` → `ArenaFC.tsx` → `registry.ts`
3. **C2-C**: store (persistedDocId) → `useCostSheetActions.ts` (handleSaveToSupabase) → `CostSheetView.tsx`/`CostSheetModuleNav.tsx` → paleta/nav-map/tips → `DarianEditor.tsx` → test navegación
4. Tests: unit del guard + store + ruta (mocks) → verificación LIVE (E2E con JWT: crear/actualizar/recuperar + separación 0/7→1/7 + limpieza del fixture)
5. TypeCheck/Lint/Tests/Build (+CI si OOM) → diff review → evidencia → commit
