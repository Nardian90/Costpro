# GATE 1.4R — 07 BREADCRUMBS — mandato §13

Fecha: 2026-09-22 · Regla: cero "Módulo No Disponible" para vistas válidas; corregir la FUENTE DE VERDAD, no crear excepciones aisladas.

## Causa raíz (UX-002) en el módulo

`getBreadcrumbForView` mapeaba `activeCostSection` → IDs técnicos (`cost-sheet-editor`, `view-assisted`, `view-reading`, `templates`, `arena-fc`, `tool-*`) que NO existen en el árbol de definición → `findDefinitionPath` devolvía `[]` → fallback "… > Módulo No Disponible". Afectaba al editor (`main`), Arena FC, modos, plantillas y tools: todas vistas/capacidades reales.

## Fix de fuente (navigation-map.ts + navigation-definition.ts)

- Nuevo registro **`COST_SHEETS_TABS`** (metadatos con label por tab técnica) — reemplaza la lista plana sin metadatos que señalaba el audit (GATE 1.4, UX-002 ROOT CAUSE: "TECHNICAL_VIEW_IDS es una lista plana sin metadatos").
- En `getBreadcrumbForView`: para `cost-sheets` + tab registrada → path del módulo (OPERACIÓN > Costo > Fichas de Costo) + leaf con el label del registro. `cost-analytics` sigue resolviendo como hoja de menú de ANÁLISIS. Tabs del editor sin registro (header, all-annexes, kpis…) conservan el comportamiento previo (leaf = hoja del módulo).
- El Header deriva su título del mismo mecanismo (Header.tsx consume `getBreadcrumbForView`) — coherencia por construcción.

## Breadcrumbs verificados en browser real

| Vista/Tab | Breadcrumb renderizado | ANTES |
|---|---|---|
| gen-easy | Inicio > OPERACIÓN > Costo > Fichas de Costo > **Generar Ficha** | Inicio > … > Fichas de Costo (sin leaf) |
| main (editor) | Inicio > OPERACIÓN > Costo > Fichas de Costo > **Editor de Ficha** | **"Módulo No Disponible"** |
| arena-fc | Inicio > OPERACIÓN > Costo > Fichas de Costo > **Arena FC** | **"Módulo No Disponible"** |
| view-assisted | … > Fichas de Costo > **Abrir Modo Asistido** | **"Módulo No Disponible"** |
| view-reading | … > Fichas de Costo > **Informe de la Ficha** | **"Módulo No Disponible"** |
| templates | … > Fichas de Costo > **Plantillas de Fichas** | **"Módulo No Disponible"** |
| massive-gen | … > Fichas de Costo > **Generación Masiva** | **"Módulo No Disponible"** |
| steel-calculator | … > Fichas de Costo > **Calculadora Estructural** | **"Módulo No Disponible"** |
| cost-analytics | Inicio > ANÁLISIS > **Análisis de Fichas** | (funcionaba con label viejo) |

## Tests

- `gate1-navigation.test.ts` (GATE 1.4R): asserts de path completo para las 8 tabs + "ninguna tab conocida produce 'Módulo No Disponible'" (loop sobre 12 tabs) + conservación del comportamiento previo para tabs sin registro.

## Nota de alcance

Las otras vistas con UX-002 fuera del módulo (storefront-config, customers, bank-reconciliation, ofertas — huérfanas de OTROS dominios) NO se tocan en esta remediación (mandato: alcance exclusivo Fichas de Costo). Quedan en el plan de Fase A del GATE 1.4 para un gate posterior; el patrón de registro con label aquí implementado es el mismo que el audit recomienda para ellas.
