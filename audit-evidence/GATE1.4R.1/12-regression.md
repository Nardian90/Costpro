# GATE 1.4R.1 — 12 REGRESIÓN (mandato §22/§28 — qué NO se rompió)

## Superficies fuera del módulo verificadas

- **Sidebar**: jerarquía OPERACIÓN/ANÁLISIS intacta; "Análisis de Fichas" sigue como hoja de
  ANÁLISIS (test contractual `cost-analytics sigue resolviendo como hoja de menú de ANÁLISIS`);
  el resaltado de "Fichas de Costo" ahora cubre todas las tabs del módulo (mejora, no regresión).
- **Suite completa**: 2175 passed / 0 failed / 24 skipped (pre-existentes) — incluye los 105
  tests de navegación (GATE 1 + 1.3 + 1.4R + 1.4R.1), url-sync, viewid-contract, cost-module,
  g2-cost-functional.
- **tsc --noEmit**: limpio.
- **ESLint**: 0 errores en los archivos tocados (warnings pre-existentes de clase
  "usar <Button> del design system" — advisory incremental, igual que baseline).

## Cambios de comportamiento DELIBERADOS (no regresiones)

| Cambio | Antes | Ahora | Justificación |
|---|---|---|---|
| Landing del módulo | `?tab=gen-easy` (Generar Fácil) | `?tab=main` (Experto) | Mandato §1/§4 |
| Default de store | cost-analytics | main | Mandato §1 (no relegar a Análisis) |
| Migración persist v<3 | main→cost-analytics | eliminada | El destino 'main' vuelve a ser válido (Experto) |
| popstate sin tab | cost-analytics | main | Coherencia con el default |
| Tab móvil | Plant./Datos/Estruct./Anexos/Más | Generar/Experto/Masiva/Análisis/Arena | Mandato §25 (misma IA que desktop) |
| Labels de modos | Experto/Resumido/Tablero/Audit | Completo/Informe/Resumen/Auditoría | Mandato §13/§14 (IDs sin cambio) |
| Breadcrumb de main | "Editor de Ficha" | "Experto" | Mandato §6/§8 |

## Compatibilidad preservada

- IDs técnicos `gen-easy / main / massive-gen / cost-analytics / arena-fc / templates /
  view-assisted / view-reading / tool-*` sin cambios (deep-links y bookmarks OK).
- Alias legacy `cost-sheet-editor → main`, `gen-quick/gen-expert → gen-easy` intactos (tests).
- Contrato `CostSheetViewMode` sin cambios (solo labels).
- Roles: las extensiones de Costo mantienen `COSTO_DOMAIN_ROLES` (clerk sigue sin verlas — test).
- GATE 1.3 (hub Ventas) y GATE 1 (fuente única) intactos — suite completa en verde.
