# FASE C — C2 · 01 IMPLEMENTATION MAP (as-built)

El mapeo pre-edición completo vive en `00-preimplementation-map.md` (generado antes de tocar código, como exige el mandato §3). Este documento registra el estado FINAL (as-built) y las desviaciones respecto al plan.

## 1. Archivos modificados (15) y nuevos (4), con propósito

### C2-A — Writer reparado
| Archivo | Cambio |
|---|---|
| `src/validation/api-schemas.ts` | `costSheetSaveSchema`: FUERA `store_id`/`storeId`; DENTRO `id?: uuid` (update) + `source: 'ai'\|'manual'` (default 'ai'). OpenAPI (`openapi-spec.ts:265`) se regenera solo (zodToOpenApi) |
| `src/app/api/cost-sheets/save/route.ts` | `withStoreAccess`→`withAuth` (la membresía de tienda era defensa huérfana sobre una columna inexistente); INSERT sin `store_id`; **UPDATE** cuando llega `id` (fetch owner-scoped → guard de compatibilidad D3 → update owner-scoped); `created_by` SIEMPRE de `session.user.id` (§6); `generatedBy` honesto según `source`; respuesta con `created: boolean` |
| `src/lib/api-errors.ts` | 2 claves nuevas del catálogo tipado: `COST_SHEET_NOT_FOUND` (404), `COST_SHEET_NOT_COMPATIBLE` (409) |

### C2-B — Aislamiento por contrato
| Archivo | Cambio |
|---|---|
| `src/lib/cost-sheets/document-compatibility.ts` (**NUEVO**) | Fuente ÚNICA de verdad: `isCostSheetDocument()`, `isFCDocument()`, `COST_SHEET_CONTRACT_FILTER` (exclusión PostgREST). Rechaza FC por sus 3 señales (model/ficha/meta2.app) + category + vacío + no-objetos; exige los 4 pilares del contrato |
| `src/hooks/api/useCostSheets.ts` | `.or(...)` + `.filter(data->ficha is null)` server-side + guard central sobre el resultado (bug corregido de paso: `await` del validador async que faltaba) |
| `src/components/views/terminal/views/cost_sheet/ArenaFC.tsx` | Mismos filtros; los documentos FC ya no entran a `calculateTemplate` (fin de la única mezcla activa) |
| `src/lib/ai/tools/registry.ts` | `search_entity('costSheet')`: `.eq('store_id')` eliminado (42703); filtros de contrato server-side + guard; las demás entidades sin cambios |

### C2-C — Guardar ≠ Exportar
| Archivo | Cambio |
|---|---|
| `src/store/cost-sheet-store.ts` | `persistedDocId: string \| null` + `setPersistedDocId()`; `validatedSet` (setSheet/loadExample/reset) limpia el vínculo — evita overwrite accidental de ficha existente (§8); el campo SE persiste en localStorage (tras recargar, Guardar sigue siendo UPDATE) |
| `src/hooks/logic/useCostSheetActions.ts` | **`handleSaveToSupabase()`** (validación → POST → feedback real → setPersistedDocId; guard anti doble-click con ref+estado); `isSavingCloud` real; mapeo: `tool-save` = export JSON (idéntico), `tool-save-cloud` = persistencia |
| `src/components/views/terminal/views/cost_sheet/CostSheetView.tsx` | `fichaContext.onSave` → persistencia real; `isSaving` → `isSavingCloud` (adiós falso "Guardando…"); ⌘S (`useExpertModeKeyboard.save`) → persistencia; el dropdown "Exportar" del CostSheetNav mantiene la descarga JSON |
| `src/components/views/terminal/views/cost_sheet/CostSheetModuleNav.tsx` | Botón "Guardar Ficha" persiste (aria-label honesto, disabled mientras guarda); NUEVO botón "Exportar JSON" explícito e independiente |
| `src/components/views/terminal/views/cost_sheet/DarianEditor.tsx` | El flujo IA envía `source:'ai'` + `id` del store y fija `setPersistedDocId(result.id)` — re-aplicaciones ya no duplican fichas |
| `src/config/navigation/navigation-definition.ts` | `tool-save` → "Exportar JSON" (honesto); NUEVO `tool-save-cloud` "Guardar Ficha" |
| `src/config/navigation/navigation-map.ts` | Ruta para `tool-save-cloud` |
| `src/config/navigation/view-tips.ts` | Tips honestos para ambos comandos |
| `src/__tests__/navigation/gate1-navigation.test.ts` | Aserción actualizada a la semántica nueva (guardar→tool-save-cloud, exportar json→tool-save) |

### Tests nuevos (3)
| Archivo | Cubre |
|---|---|
| `src/__tests__/lib/cost-sheet-document-compatibility.test.ts` | 16 tests: ACCEPT/REJECT del contrato (§20) + determinismo + filtro PostgREST |
| `src/__tests__/api/cost-sheets-save.test.ts` | 7 tests del writer: CREATE sin store_id, payload de flujo IA legado, UPDATE sin duplicar + doble ownership, 404 ajeno, **409 sobre FC propio (D3)**, 409 semilla, 400 id inválido |
| `src/__tests__/store/cost-sheet-persisted-doc.test.ts` | 4 tests: vínculo id, limpieza en setSheet/loadExample/reset, rechazo Zod de FC-format intacto |

## 2. Desviaciones del plan pre-implementación

1. **Guard D3 en el UPDATE (nuevo, no previsto en el mapa)**: durante el E2E se produjo un incidente (un script de prueba defectuoso sobrescribió y borró el documento FC `0024c883`, propiedad del usuario de prueba — recuperado íntegramente; informe completo en `07-security.md`). El writer ahora **verifica que el destino del UPDATE sea un documento CostSheet compatible** antes de sobrescribir (409 `COST_SHEET_NOT_COMPATIBLE`). Esta defensa cierra en código la clase exacta del accidente y refuerza D3 («no convertir», «no modificar fichas FC»).
2. **`validateRPCArrayResponse` es async**: el código existente devolvía la Promise sin `await` dentro de un queryFn async (funcionaba por azúcar de react-query); al añadir `.filter()` se corrigió con `await` (uso correcto, sin cambio de comportamiento).
3. Todo lo demás se implementó tal como estaba mapeado.

## 3. Lo que NO se tocó (verificación de alcance)

- `public/fc/**` — cero diffs (contrato FC, SW, offline, sync, fichas).
- `supabase/migrations/**` — cero migraciones; cero DDL/DML de esquema.
- Políticas RLS — sin cambios (el acceso sigue: owner-manage + tenant-read + admin).
- `product_cost_sheets` / `cost_sheet_templates` — sin cambios (tablas distintas, correctas).
- `RecentCostSheets.tsx` (widget desmontado) — sin cambios, documentado.
- Sin APIs paralelas, sin segundo sistema de persistencia, sin duplicación de motores.
