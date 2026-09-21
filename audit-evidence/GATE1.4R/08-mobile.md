# GATE 1.4R — 08 MOBILE — mandato §14

Fecha: 2026-09-22 · Regla: la solución móvil deriva de la MISMA fuente de navegación (navigation-definition.ts → MobileTabBar/registros), sin menú móvil paralelo.

## Derivación (código)

- Las entradas palette nuevas llevan `mobileHide: true` → NO se duplican en el sheet "Más" (mismo patrón que las extensiones del hub Ventas, GATE 1.3).
- El sheet móvil sigue derivándose de NAVIGATION_SECTIONS (sin cambios) — Fichas de Costo y Análisis de Fichas heredan el rename y la estructura automáticamente.
- La tarjeta Arena FC vive dentro de GenEasyView → presente en móvil por render directo (no es un canal nuevo).

## Verificación en browser real

| Prueba | 390×844 | 375×667 |
|---|---|---|
| Fichas de Costo encontrable (sheet/sidebar) | ✅ button "FICHAS DE COSTO" | ✅ |
| Arena FC encontrable | ✅ tarjeta visible en gen-easy (button con aria-label completo) | ✅ |
| Arena FC abre | ✅ render ARENA FC + URL arena-fc (con drawer cerrado) | ✅ (mismo flujo) |
| Análisis de Fichas comprensible | ✅ button "ANÁLISIS DE FICHAS" accesible | ✅ |
| Labels críticos no truncados | ✅ tarjeta usa layout ícono+texto+chevron con wrap seguro (min-w-0/flex-1) | ✅ |
| Sin interacción inexplicable para capacidades recuperadas | ⚠️ con la excepción pre-existente del drawer auto-abierto (UX-007c) que ocluye contenido hasta cerrarse — deuda documentada, fuera de alcance | ⚠️ ídem |
| Sin navegación duplicada | ✅ 0 entradas nuevas en sheet; tabs fijas intactas | ✅ |

Evidencia: mobile-390-gen-easy-arena-card.png · mobile-390-arena-fc.png · mobile-375-sheet-analisis.png

## Deuda móvil explícitamente NO tocada (scope)

- UX-007c (drawer auto-abierto al cargar) y UX-007d (sheet plano/largo): pertenecen a Fase E del plan GATE 1.4 (MobileTabBar). Esta remediación no modifica MobileTabBar.
- Con esa salvedad, la paridad estructural desktop/móvil se conserva (misma fuente de verdad).
