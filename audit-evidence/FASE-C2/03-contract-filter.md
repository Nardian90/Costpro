# FASE C — C2 · 03 CONTRACT FILTER (C2-B)

## Regla implementada (D2/D4/D5)

> La biblioteca CostSheet solo muestra documentos compatibles con el contrato CostSheet. Una biblioteca no muestra documentos que su editor no puede abrir.

## 1. Función central (`src/lib/cost-sheets/document-compatibility.ts`) — NUEVA

`isCostSheetDocument(data)` — determinista y testeable, ÚNICA fuente de verdad:
- RECHAZA: no-objetos/arrays/vacíos (`data={}`), la familia FC por cualquiera de sus señales (`data.model === "FC_RES148_2023_V1"`, `data.ficha`, `meta2.app === 'FC'`), `category === "FC Res148"`, y documentos sin los 4 pilares (header/sections/annexes/signature).
- La validación Zod completa (`costSheetDataSchema` en `setSheet`) sigue siendo la puerta de APERTURA — capas: **query (PostgREST) → guard central (lectores) → Zod (apertura)**.

Filtro PostgREST (`COST_SHEET_CONTRACT_FILTER`), sintaxis validada empíricamente contra LIVE ANTES de implementar (GET de solo lectura):
- `or=(data->>model.is.null,data->>model.neq.FC_RES148_2023_V1)` → excluye los 7 FC, conserva filas sin model
- `data->ficha=is.null` → excluye estructuras FC
- La semilla vacía pasa el filtro de servidor y es rechazada por el guard (por eso ambas capas).

## 2. Aplicación en las superficies (§12)

| Superficie | Antes | Ahora |
|---|---|---|
| `useCostSheets` (biblioteca/hook) | `select('*')` sin filtro | filtros server-side + guard central |
| `ArenaFC` (única mezcla activa) | calculaba el motor terminal sobre los 7 FC (`values['5']` indefinido) | FC excluido en servidor y por guard; solo CostSheet comparables |
| `search_entity('costSheet')` (IA) | `.eq('store_id')` → 42703 en cada llamada | sin store_id; filtros de contrato + guard; otras entidades intactas |
| `RecentCostSheets` | desmontado desde 2026-03-03 | sin cambios (si se re-montara, hereda el hook filtrado) |
| FC.html | pull con guard propio `v(e)` | SIN CAMBIOS (ya implementaba el aislamiento) |
| Apertura (`setSheet`) | Zod rechaza FC-format | sin cambios (3ª capa intacta) |

## 3. §13 — NO filtrar solo en UI

La exclusión FC ocurre en la CONSULTA (PostgREST), antes de que los documentos lleguen a la aplicación; el guard central filtra el resultado en la capa de recuperación (hooks/herramienta IA); la UI no adivina nada. Evidencia E2E (Flujo C): con 7 FC + 1 semilla, la query filtrada devuelve 1 fila (la semilla) y el guard la reduce a **0**; tras crear 1 CostSheet, servidor=2 → guard=**1** (exactamente el documento nuevo). NUNCA 8.

## 4. Los 7 documentos FC — verificación de intangibilidad (§14)

- E2E: hash SHA-256 de `data` + `updated_at` de los 7 FC idénticos antes/después de toda la suite E2E (incluidos los ataques 404/409) → **byte-intactos**.
- FC.html sigue encontrando sus documentos (su pull no cambió y su vista de datos no fue tocada; `GET /fc/FC.html` = 200).
- `git diff -- public/fc/` = vacío.

Tests: `src/__tests__/lib/cost-sheet-document-compatibility.test.ts` (16) · resultados E2E: `scripts/fasec2-e2e-results.json`.
