# GATE 1.4R.1 — 06 ACCIONES (mandato §16)

## Zona de acciones

Nueva **fila de contexto de ficha** dentro de `CostSheetModuleNav` (visible en todo el scope
Experto, no solo en Estructura):

```text
[Modo: Completo ▼] │ [Guardar Ficha] [Importar JSON] [Exportar Excel] [Exportar PDF]
```

- Targets ≥44px, labels claros en español, aria-labels completos, scroll horizontal en móvil.
- Los handlers son los YA existentes de `useCostSheetActions` (0 duplicación de lógica):
  `handleExportJSON` / `handleImportJSON` / `handleExportExcel` / `modal PDF (handleExportPDF)`.
- La toolbar `CostSheetNav` dentro de Estructura se conserva (Exportar PDF directo, Opciones,
  Historial, Tarjeta/Tabla) — la zona nueva ELEVA las acciones, no las sustituye.

## Duplicación eliminada (GATE 1)

`CostSheetActionsPanel.tsx` (slide-over, 365 líneas) era CÓDIGO MUERTO en baseline:
ningún JSX lo renderizaba y `isActionsPanelOpen` no consumía UI. La nueva zona cumple
su rol funcional con handlers vivos. (El archivo muerto no se borra en este gate — sin
mandato de limpieza; documentado para Fase de higiene.)

## Evidencia browser (ficha abierta, usuario admin@demo.com)

| Acción | Resultado observado | Evidencia |
|---|---|---|
| Guardar Ficha | JSON `ficha-…json` (45KB) descargado a Downloads a las 23:52 + toast | descarga verificada |
| Exportar Excel | CSV `Ficha de Costo - Plantilla de Reinicio.csv` (3.6KB) descargado | descarga verificada |
| Exportar PDF | Modal "Exportar Documentos" con anexos III/IV/V + opciones CUP+USD, consolidado | `browser-exportar-pdf-modal-1440.png` |
| Importar JSON | Trigger dispara file chooser del navegador; app responde sin colgar; la lógica de carga (`setSheet` + parse) es la misma verificada vía puente `tool-import` en GATE 1.4R y en tests unitarios | trigger verificado |

## Flujo F (mandato §26)

Guardar Ficha **PASS** · Importar JSON **PASS (trigger + lógica por puente/tests)** ·
Exportar Excel **PASS** · Exportar PDF **PASS**.
