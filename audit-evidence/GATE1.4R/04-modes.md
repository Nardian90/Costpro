# GATE 1.4R — 04 MODOS (Asistido · Informe) — mandato §9

Fecha: 2026-09-22 · Regla: Asistido e Informe son MODOS del editor (viewMode `assisted`/`reading`). Prohibido crear "Fichas de Costo → Asistido" / "→ Informe" como vistas principales. Problema a resolver: descubrimiento.

## Modelo preservado (verificación de código)

- Render por `viewMode`, NO por `activeCostSection`: CostSheetView renderiza `<CostSheetWizard />` cuando `viewMode==='assisted'` y `<CostSheetNarrative />` cuando `viewMode==='reading'` (fuera de la rama expert).
- Puente existente (sin cambios): tab técnica `view-assisted` → `handleSetViewMode('assisted')`; `view-reading` → `('reading')` en useCostSheetActions.
- El panel flotante del editor (CostSheetActionsPanel, grupo "Modos de Visualización") sigue siendo el switcher en contexto — INTACTO.
- Tests anti-duplicación: `view-assisted`/`view-reading` NO son hojas de menú (gate1-navigation.test.ts — GATE 1.4R).

## Descubrimiento añadido (palette, no navegación)

- Acción contextual **"Abrir Modo Asistido"** (keywords: asistido, modo asistido, guiado, paso a paso, wizard) → ruta `view-assisted` → puente existente activa el modo.
- Acción contextual **"Informe de la Ficha"** (keywords: informe, informe de ficha, lectura, narrativo, presentable) → `view-reading`.
- Ambas ejecutan "abrir el módulo y activar" (mecanismo propuesto por 14-proposed-navigation.md) — NO crean páginas, NO tarjetas, NO duplican el editor.

## Validación browser (desktop 1440)

| Prueba | Resultado |
|---|---|
| Palette "asistido" | ✅ 1er hit "Abrir Modo Asistido" (ANTES: 0 resultados — medido en GATE 1.4) |
| Enter sobre el resultado | ✅ URL `?view=cost-sheets&tab=view-assisted`; **MODO ASISTIDO** renderiza el wizard con Pasos 1–4 (Identificar Producto → Anexo III) |
| Palette "informe" | ✅ 1er hit "Informe de la Ficha" (ANTES: única pista "Reportes" = falsa pista) |
| Enter | ✅ **INFORME DE COSTO** (narrativa) renderiza |
| Breadcrumb de ambos modos | ✅ `… > Fichas de Costo > Abrir Modo Asistido / Informe de la Ficha` (antes: falso "Módulo No Disponible") |
| Labels comprensibles | ✅ "Modo Asistido" unificado en palette (el panel dice "Asistido" — variante corta contextual aceptada; glosario GATE 1.4 lo documentó) |
| Volver al editor | ✅ CostSheetNav/panel disponibles al volver a `main` |

## Desktop y móvil

- Desktop (1440/1280/1024): modos descubribles por palette + panel del editor.
- Móvil: los modos se acceden desde el editor (sin cambio de arquitectura); la tarjeta Arena y el módulo son alcanzables; los modos no requieren caminos extra (modelo de contexto).
