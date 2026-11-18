# PROBLEM_SECTION_STATIC_REDESIGN — «Los cuatro malabares» sin ciclo vertical

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §5 · **Fecha:** 2026-11-18

## 1. Defecto reportado

La pieza del hero con las cuatro expresiones reales del problema —«ventas en cuadernos»,
«inventario en papel», «costos a ojo», «deudas en chats»— tenía:

1. Una **animación vertical cíclica** (flotación `y: [0, -6, 0]` con
   `repeat: Infinity` sobre la columna completa, 7.5 s por ciclo) que el propietario
   no quiere.
2. Una **composición pobre**: cuatro chips idénticos (misma píldora, mismo borde, mismo
   `line-through`) ensamblados en columna — sin jerarquía ni identidad gráfica.

## 2. Eliminación del movimiento (lo que ya NO existe)

| Elemento eliminado | Código que se borró |
| --- | --- |
| Flotación vertical cíclica | `animate={{ y: [0, -6, 0] }} transition={{ duration: 7.5, repeat: Infinity, … }}` |
| Componente animado completo | `ChaosToOrderChips` (framer-motion: entrada dispersa con springs + eje con `scaleY` + caption con fade) |
| Cualquier reemplazo automático | **No se sustituyó por ningún otro movimiento automático** — sin marquee, sin carrusel, sin bucle, sin aparición/desaparición |

La nueva pieza (`ProblemsEditorialScene`) **no importa ni usa framer-motion**: no tiene
una sola animación —ni de entrada—. `prefers-reduced-motion` no necesita excepciones
porque no hay nada que silenciar. La lectura funciona idéntica desde la primera pintura
(con y sin movimiento).

## 3. Nueva dirección visual — composición editorial estática

Concepto: **mesa de edición / expediente del desorden**. Los cuatro problemas conviven
en una misma escena asimétrica y cada uno tiene una identidad gráfica propia (no cuatro
tarjetas genéricas):

| # | Problema | Identidad gráfica | Tipografía |
| --- | --- | --- | --- |
| N.01 | ventas en cuadernos | Hoja pautada (`repeating-linear-gradient` de líneas cada 24px) con **margen verde de cuaderno** y etiqueta rompebordes | Instrument Serif italic, blanca 85% |
| N.02 | inventario en papel | **Hoja de control** con retícula 4×4; celdas con ✓ verdes y × apagadas (estado de control sin datos inventados) | Mono uppercase |
| N.03 | costos a ojo | **Anotación a mano**: «costos» mono + «a ojo» serif italic grande con **subrayado SVG fijo** (trazo curvo, verde) | Mono + Instrument Serif |
| N.04 | deudas en chats | **Fragmento de conversación**: burbuja (`rounded-bl-sm`, borde 0.11) con el mensaje y **tres puntos de «escribiendo…» estáticos** | Mono |

Recursos de escena: numeración editorial (N.01–N.04 en mono, etiquetas que rompen el
borde de su fragmento), **marcas de registro** en las cuatro esquinas (mesa de edición),
rotaciones fijas ligeras (−1.5°, +1.25°, −0.75°, +1°) que transmiten el desorden **sin
animar nada**, y el pie aprobado «LO DISPERSO — UN SOLO SISTEMA» con acento verde.

## 4. Geometría

- Contenedor `relative lg:block w-full max-w-[440px] aspect-[440/400]` en la columna
  derecha del hero (`lg:col-span-5`, `items-center`).
- Posiciones y anchos en **%** sobre el contenedor con `aspect-ratio`: la composición
  escala de forma coherente desde 1024 px (primer breakpoint `lg`) hasta 1920 px sin
  solapes (validado: `zoom-scene-1024.png`, `zoom-scene.png`).
- En móvil y tablet (`<lg`) la pieza no aparece (igual que antes): el hero móvil conserva
  sus tres líneas monumentales + CTAs + tres caminos sin sobrecarga.

## 5. Accesibilidad

- La pieza es decorativa (`aria-hidden`); los cuatro problemas son redundantes con el
  subtítulo del hero (que sí es texto accesible).
- Contrastes: texto blanco 85% sobre #05070A ≈ 12.9:1; mono 55% ≈ 5.6:1; etiquetas 35%
  ≥ 3:1 (texto decorativo pequeño).
- El único SVG (subrayado) es estático, `aria-hidden` por herencia.

## 6. Evidencia

- ANTES (chips animados, `line-through`): `evidencia-003/before/05-problemas-1440-before.png`.
- DESPUÉS (escena estática): `evidencia-003/after/zoom-scene.png` (1440) y
  `evidencia-003/after/zoom-scene-1024.png` (1024, ancho más ajustado).
- Medición de estaticidad: `responsive_003_metrics.json` — `sceneAnim: "none"`
  (`animation-name: none`, sin transiciones) en los 6 viewports.
