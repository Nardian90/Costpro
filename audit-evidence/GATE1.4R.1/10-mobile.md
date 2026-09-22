# GATE 1.4R.1 — 10 MOBILE (mandato §25)

## Principio: UNA sola IA

El móvil comparte la MISMA arquitectura de segundo nivel que desktop. `MobileTabBar`
sustituye sus tabs contextuales del módulo (antes: sub-tabs Plant./Datos/Estruct./Anexos/Más
— una IA paralela que además mostraba sub-tabs de Experto dentro de Arena FC) por los
**tabs del MÓDULO**: Generar · Experto · Masiva · Análisis · Arena (mapeo compartido
`moduleTabForCostSection` — mismo archivo de verdad que el desktop).

- Los sub-tabs de Experto (Plantillas/Datos Generales/Estructura/Anexos) son **in-page**
  (CostSheetMainTabs, scroll horizontal sticky), como en desktop.
- El estado activo del bottom bar usa el mismo mapeo: cualquier sección del scope Experto
  resalta EXPERTO; gen-easy→GENERAR; massive-gen→MASIVA; cost-analytics→ANÁLISIS; arena-fc→ARENA.
- **Fix de truncado**: labels del bottom bar a 9px (`small` prop) — en 390/375 los cinco
  labels se leen completos (GENERAR/EXPERTO/MASIVA/ANÁLISIS/ARENA), sin truncar.

## Fix real (bug móvil heredado)

La tab móvil "Datos" emitía `setActiveCostSection('general')` y CostSheetView no tenía rama
para ese id → contenido VACÍO. Corregido (mapping + rama de render); además el id ya no se
emite desde el bottom bar (los sub-tabs son in-page), pero el fix protege estados persistidos
antiguos con `'general'`.

## Evidencia browser

| Viewport | Captura | Contenido verificado |
|---|---|---|
| 390×844 | mobile-390-experto.png | breadcrumb EXPERTO, nav 2º nivel, Modo: Completo + Guardar Ficha, sub-tabs, bottom bar 5 tabs sin truncar, editor |
| 390×844 | mobile-390-arena.png | tab ARENA activa, breadcrumb ARENA FC, comparador con fichas |
| 375×667 | mobile-375-generar.png | tab GENERAR activa, Generación Rápida/Masiva, tarjeta Arena FC, bottom bar sin truncar |

## Flujo de descubrimiento móvil (§27)

Fichas de Costo → bottom bar: Generar/Experto/Masiva/Análisis/Arena alcanzables en 1 tap;
con ficha abierta: Modo + Acciones visibles bajo la nav del módulo (scroll horizontal corto,
sin scroll infinito). **PASS**
