# GATE 1.4R — 05 ACCIONES DEL EDITOR — mandato §10

Fecha: 2026-09-22 · Regla: Guardar / Importar JSON / Exportar Excel / Exportar PDF son ACCIONES contextuales de una ficha abierta. Prohibido convertirlos en vistas. Problema a resolver: palette-gap (UX-008).

## Arquitectura aplicada

- Los 4 handlers existentes en `useCostSheetActions` NO se tocaron: `handleExportJSON`, `handleImportJSON`, `handleExportExcel`, `handleExportPDF` (modal Res. 148/2023).
- Los puentes `tool-save` / `tool-import` / `tool-export-excel` / `tool-export-pdf` (useEffect que ejecuta la acción y regresa a `main`) ya existían y son el mecanismo de ejecución — reutilizados tal cual.
- Nuevo: 4 entradas de **acción contextual en palette** (via registro COST_SHEETS_TABS, kind='accion'):
  - "Guardar ficha (JSON)" — keywords: guardar, guardar ficha, json, descargar, backup, respaldo
  - "Importar ficha (JSON)" — keywords: importar, importar json, json, cargar, archivo, restaurar ficha
  - "Exportar ficha a Excel" — keywords: excel, exportar excel, csv, hoja de cálculo, planilla
  - "Exportar ficha a PDF" — keywords: pdf, exportar pdf, imprimir, resolución 148, formato oficial

## Por qué esto respeta "acción, no ruta falsa"

- Seleccionar la acción abre el módulo en SU tab técnica; el puente existente ejecuta el handler real y vuelve al editor — no existe una "página de exportar" (la tab tool-* nunca renderiza contenido propio).
- "No funcionar si no hay ficha": los handlers ya se defienden (PDF: toast "No hay datos de cálculo disponibles" si `calculationResult` es null; Excel/JSON exportan el estado actual — comportamiento previo conservado).
- Permisos: roles del dominio Costo — sin cambios de seguridad.

## Defecto mecánico corregido (bloqueante descubierto en implementación)

`actions.ts` derivaba extensiones con `route: ext.route.view` — **descartaba el `tab`** de rutas module-route. Cualquier extensión con tab aterrizaba en el default del módulo (gen-easy) = falsa pista exacta prohibida por §12. Corregido a `route: ext.id` (cada extensión resuelve su ruta propia en NAVIGATION_MAP; para las 5 extensiones pre-existentes el resultado es idéntico, verificado por suite completa 2164 tests).

## Validación

| Prueba | Resultado |
|---|---|
| Palette "guardar ficha" → Enter | ✅ ejecuta export JSON y regresa al editor (`tab=main`, breadcrumb "Editor de Ficha") |
| Palette "importar json" | ✅ 1er hit exacto |
| Palette "exportar pdf" / "exportar excel" | ✅ 1er hit exacto cada uno |
| Palette "json" (regresión UX-008) | ✅ **Importar/Guardar ficha (JSON) como 2 primeros hits** (antes: solo Usuarios/Vitrina por fuzzy) |
| Acciones en el editor (regresión) | ✅ Guardar (JSON) · Importar JSON · Exportar Excel · Exportar PDF presentes en CostSheetNav/ActionsPanel (DOM verificado) |
| Test anti-menú | ✅ tool-* NO son hojas de menú |
