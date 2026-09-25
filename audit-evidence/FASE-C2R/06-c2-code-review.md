# FASE C2R — 06 C2 CODE REVIEW (writer · contrato · lectores · store_id)

SHA auditado: `00a7c9a7` (incluye `ca3a019f`). Todo leído, nada modificado.

## 1. WRITER — `src/app/api/cost-sheets/save/route.ts`

### CREATE (sin `id`) — §11
- INSERT con **solo columnas reales**: `{name, description, category, data, created_by}` (líneas 265-275). **Cero `store_id`/`storeId`** en el payload.
- `created_by: session.user.id` — SIEMPRE del contexto autenticado (`withAuth` + `getSupabaseAuthClient(session.token)`); el cliente no puede suplantarlo (no se lee del body; el Zod del writer ni lo acepta).
- Esquema real de `cost_sheets` verificado contra LIVE (OpenAPI + probe 42703 — ver 02-live-census §1).

### UPDATE (con `id`) — protección explícita §11
1. Fetch **owner-scoped**: `.eq('id', existingId).eq('created_by', session.user.id)` → 404 `COST_SHEET_NOT_FOUND` si no existe o es ajeno (líneas 210-224).
2. **Guard D3**: `if (!isCostSheetDocument(existingRow.data)) → 409 COST_SHEET_NOT_COMPATIBLE` (líneas 226-231). Un documento FC **incluso propio** o la semilla NUNCA se sobrescriben.
3. UPDATE de nuevo owner-scoped (doble `.eq` en fetch Y update, líneas 233-244).
- La protección usa el **discriminador contractual real** (`isCostSheetDocument`), NO posición, NO nombre, NO usuario, NO `store_id`. Probada E2E (409 sobre FC propio; fila byte-intacta) y unitaria (tests 158/177 de `cost-sheets-save.test.ts`).

### DELETE — §11
- C2 **no toca DELETE**: no existe ruta DELETE/duplicar en el terminal (preexistente y documentado en C2 02-writer-fix §Limitaciones; `git diff` C2 no añade ninguna). La limpieza E2E del fixture usó DELETE PostgREST directo por id exacto desde el script de prueba (fuera del repo), no del producto.

### Observación de hardening (recomendación, NO defecto bloqueante)
El guard D3 protege el **destino de UPDATE**. En CREATE, la forma del `data` escrito proviene del flujo validado del terminal (Zod de apertura `costSheetDataSchema` en `validatedSet` + pipeline del engine), pero la ruta no ejecuta `isCostSheetDocument(exportData)` antes del INSERT. Riesgo residual teórico: un cliente autenticado podría INSERTar una fila nueva de forma FC-like (basura propia del usuario). **No puede** modificar los 7 FC (CREATE no toca filas existentes) ni contaminar la biblioteca terminal (el guard la excluiría). Se registra como recomendación de hardening para fase posterior.

## 2. isCostSheetDocument — `src/lib/cost-sheets/document-compatibility.ts` (§12)

| Pregunta | Respuesta |
|---|---|
| ¿Dónde definido? | `src/lib/cost-sheets/document-compatibility.ts` — **única definición** en el repo (6 archivos la referencian: 3 lectores + writer + util + test; import, no re-implementación) |
| ¿Qué condiciones? | RECHAZA: no-objetos/arrays/null, `{}` (vacío), señales FC (`model === 'FC_RES148_2023_V1'`, `'ficha' in data`, `meta2.app === 'FC'`, `category === 'FC Res148'`); EXIGE los 4 pilares (header objeto, sections array, annexes array, signature objeto) |
| `{}` | → `false` (rechazada — coherente con la semilla) |
| Documento FC | → `false` por cualquiera de las 3+1 señales (defensa en profundidad) |
| CostSheet válido | → `true` (4 pilares) |
| Datos malformados | → `false` (null/primitivos/arrays) |
| ¿Fuente única razonable? | SÍ — determinista, testeada (16 tests en `cost-sheet-document-compatibility.test.ts`), con `isFCDocument` y `COST_SHEET_CONTRACT_FILTER` exportados del mismo módulo |

## 3. TRES LECTORES (§13) — filtro contractual real en capa de recuperación

| Lector | Filtro server-side (PostgREST) | Guard central | Verificado |
|---|---|---|---|
| `src/hooks/api/useCostSheets.ts` | `.or(data->>model.is.null,data->>model.neq.FC_RES148_2023_V1)` + `.filter('data->ficha','is',null)` | `validated.filter(row => isCostSheetDocument(row?.data))` tras validación Zod de filas | ✓ (líneas 26-49) |
| `src/components/.../cost_sheet/ArenaFC.tsx` | mismos dos filtros | `data.filter(d => isCostSheetDocument(d?.data))` ANTES de dedup/`calculateTemplate` | ✓ (loadUserSheets) |
| `src/lib/ai/tools/registry.ts` — `search_entity('costSheet')` | `.eq('store_id')` **eliminado** (era 42703); mismos dos filtros solo para costSheet | `results = isCostSheetSearch ? (data||[]).filter(row => isCostSheetDocument(row?.data)) : data` — otras entidades sin cambios | ✓ |

- NUNCA mezcla: la semilla pasa el filtro de servidor pero el guard la rechaza (0 compatibles con 7 FC + 1 seed — probado E2E en C2, Flujo C: 0 → 1 tras crear, jamás 8).
- FC documents no tratados como CostSheet en ninguna superficie.

## 4. Escaneo `store_id` en el diff C2 (§16)

```text
git diff bbb74f4c..00a7c9a7 -- src/ | grep '^\+' | grep store_id
→ 11 líneas: TODAS comentarios/documentación de la prohibición y ASERCIONES de tests que
  verifican AUSENCIA ('expect(payload).not.toHaveProperty("store_id")').
Líneas eliminadas con store_id: 9 (el código roto que C2 quitó: schema store_id requerido,
insert con store_id, .eq('store_id') en registry, withStoreAccess).
```

**Resultado esperado confirmado**: `NO store_id como columna utilizada por el writer/readers de cost_sheets`. Referencias textuales restantes = documentación/tests, permitidas por el mandato.

## 5. Store y apertura (3ª capa intacta)

- `src/store/cost-sheet-store.ts`: `validatedSet` sigue parseando con `costSheetDataSchema.safeParse` (rechaza FC-format al ABRIR); `persistedDocId` se limpia en setSheet/loadExample/reset y se persiste en localStorage (Guardar tras recargar = UPDATE, no INSERT).

## 6. Tests del incidente (§17)

`src/__tests__/api/cost-sheets-save.test.ts` (en repo, 7 tests):
- «CREATE sin store_id: inserta con created_by del session» ✓ (CostSheet válido → operación prevista)
- «UPDATE con id: nunca inserta, verifica compatibilidad del destino y filtra por owner» ✓
- «UPDATE de ficha ajena o inexistente → 404» ✓ (owner vs foreign)
- «**D3: UPDATE cuyo destino es un documento FC (incluso propio) → 409, sin tocarlo**» ✓
- «**D3: UPDATE cuyo destino tiene data vacía (semilla) → 409**» ✓
- «rechaza id con formato inválido (400 Zod)» ✓
Más 16 tests de contrato y 4 de store (03/05 de C2). Diseño del E2E v2 endurecido (documentado en C2 07-security §3): ORDER BY determinista, objetivo filtrado por `created_by != UID` con re-afirmación, limpieza por **id exacto**, precondición sin residuos, verificación byte-a-byte final — cumple los principios §17/§22. El script v2 en sí estaba fuera del repo y se perdió (MISSING, ver 01-baseline §3); su lógica protectora permanente vive en los tests unitarios en-repo.
