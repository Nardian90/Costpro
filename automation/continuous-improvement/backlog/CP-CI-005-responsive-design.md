# CP-CI-005 — Responsive design

**Área**: responsive · **Prioridad**: P4 · **Estado inicial**: queued

## Objetivo
Auditar y corregir comportamientos responsive reales: desbordamientos, componentes mal distribuidos, textos ilegibles y controles inaccesibles — en desktop, laptop, tablet y móvil — sin reducir tamaños indiscriminadamente.

## Criterios de entrada
- STATE.json sin lock; skill `costpro-mobile-first-auditor` leída (además de las obligatorias).
- Unidad = módulo/vista concreta con hallazgo medido, no especulativo.

## Unidades (una por ciclo)
- **U1 — Ejecutar y ampliar la auditoría programática**: `e2e/mobile-viewport-audit.spec.ts` (375×667, 390×844, 360×800, 768×1024 — valida PWA meta, safe-areas, scroll-x, targets ≥44px) sobre las vistas principales; identificar módulos con fallos y crear unidades específicas para ellos.
- **U2 — Vista específica con desbordamiento**: recorridos E2 con agent-browser (`set viewport`), detección de scroll horizontal de página (`document.documentElement.scrollWidth > innerWidth`), elementos cortados bajo el header fijo (`scroll-padding-top: 100px`), solapamientos con MobileTabBar/safe-areas (`env(safe-area-inset-bottom)`).
- **U3 — Tablet intermedia (768–1024px)**: layouts híbridos (Sidebar vs MobileTabBar) — verificar transición de breakpoints sin estados "entre mundos".

## Límites de alcance
No reducir todo con `scale`/tamaños menores: usar las convenciones del repo (hardening CSS ≤375/≤420px, `ResponsiveTable` con prioridades de columna, `HorizontalScroll`, tabs con `flex-nowrap overflow-x-auto`). No tocar la lógica de negocio; solo presentación/layout. No duplicar hardening CSS: extender el existente si el origen es común.

## Procedimiento
Fases A–H. Medición con los 4 viewports reales → inventario de defectos con viewport y captura → corrección → spec E2E de la vista si existe + auditoría mobile de nuevo (antes/después literal) → verificación E2 adicional en modo dark.

## Pruebas y criterios de aceptación
1. Cero scroll horizontal de página en los viewports auditados de las vistas tocadas.
2. Targets táctiles ≥44×44px verificados en los controles corregidos.
3. `mobile-viewport-audit.spec.ts` verde (o mejora literal de sus aserciones).
4. Informe con matriz vista × viewport antes/después.

## Certificación esperada
APROBADA con evidencia de re-auditoría; BLOQUEADA si no se puede levantar entorno de pruebas (no declarar correcciones no verificadas).
