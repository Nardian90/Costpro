# FASE C — C2 · 04 SAVE SEMANTICS (C2-C)

## Semántica final (D7)

```text
Guardar Ficha   → handleSaveToSupabase()  → POST /api/cost-sheets/save → PERSISTE en cost_sheets
Exportar JSON   → handleExportJSON()      → Blob/download local (sin red) — función conservada
Importar JSON   → handleImportJSON()      → carga validada por Zod (sin persistir) — sin cambios
⌘S              → Guardar Ficha (persistencia real)
```

## UX de Guardar (§16, punto por punto)

| # | Requisito | Implementación |
|---|---|---|
| 1 | validación | existencia de ficha activa + header; el documento SIEMPRE viene del store validado por Zod |
| 2 | estado de guardado | `isSavingCloud` (estado REAL de la petición) — el botón se deshabilita |
| 3 | llamada real al writer | POST con `Authorization: Bearer <JWT de usuario>` (nunca service role) |
| 4 | respuesta | `result.ok` / `result.created` / errores HTTP interpretados |
| 5 | actualización del ID | `setPersistedDocId(result.id)` tras crear → el siguiente Guardar es UPDATE (§8) |
| 6 | fecha/estado | `updated_at` lo mantiene la BD; el store persiste el vínculo (sobrevive recargas) |
| 7 | feedback de éxito | toast: «Ficha guardada en tu librería» / «Ficha actualizada en tu librería» |
| 8 | feedback de error | toast de error con el mensaje real (404 ajena / 409 no-compatible / red / sesión) |
| 9 | sin falso "Guardando…" | el botón ya no se alimenta del `isSaving` del autosave local (snapshots); solo del estado real |

## Anti-doble-guardado (§17)

- Guard con `useRef` (`isSavingCloudRef`) + estado: reentradas y doble click se ignoran.
- CREATE→UPDATE vía `persistedDocId` elimina la duplicación por repetición (el patrón que el sync FC mostró con sus homónimos — F-6 de C1).
- Sin sistema nuevo de idempotencia DB (no imprescindible; fuera de alcance).

## Superficies corregidas

| Superficie | Antes | Ahora |
|---|---|---|
| Botón "Guardar Ficha" (`CostSheetModuleNav`) | `handleExportJSON` + aria "descarga…JSON" | `handleSaveToSupabase` + aria «persiste la ficha actual en tu librería (Supabase)» + NUEVO botón "Exportar JSON" al lado |
| ⌘S (modo experto) | descargaba JSON | persiste |
| Paleta `tool-save` | «Guardar ficha (JSON)» (mentía) | «Exportar JSON» (honesto; keywords ajustadas) |
| Paleta (nuevo) `tool-save-cloud` | — | «Guardar Ficha» (persistir; keywords guardar/salvar/persistir/librería/nube) |
| Dropdown "Exportar" (CostSheetNav) | descarga JSON | sin cambios (ya era honesto) |
| Flujo IA "Aplicar y guardar" | INSERT siempre (duplicados) | UPDATE del mismo documento si ya existe (`id` del store) |

## Flujo B (mandato §24): Exportar JSON

`handleExportJSON` se conserva INTACTO (mismo Blob/download/mensaje). La separación es de wiring: ninguna superficie etiquetada "Guardar" invoca la descarga, y la descarga no toca la red. Verificado por diff (`useCostSheetActions.ts`: `handleExportJSON` sin cambios funcionales) y por los tests de paleta/navegación.

## Evidencia E2E (Flujo A)

Ejecutada contra la app real con JWT de usuario (login `admin@demo.com`): crear → 200/created:true → censo 9 con CS=1 → editar → Guardar → 200/created:false, sin nueva fila → recupero por id con 4 pilares → limpieza por id exacto → censo 8/7/0/1 con FC byte-intactos. Log: `scripts/fasec2-e2e-results.json`.
