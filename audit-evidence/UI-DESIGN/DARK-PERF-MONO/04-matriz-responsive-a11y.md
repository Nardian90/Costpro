# DARK PERFORMANCE MONOCHROME — 04 Matriz Theme×Mode + Responsive + A11y

## Matriz de regresión (GATE 9) — verificada en navegador real

| Theme | Mode | Resultado | Evidencia |
|---|---|---|---|
| Dark | Performance | **MONOCHROME** — verde decorativo 0 en 6 superficies | `shots/dpm-after-*-dark-perf-1280.png` + métrica 03 |
| Dark | Enhanced | Comportamiento F6 intacto — identidad verde (fuentes verdes 35/131/17/101/20/35 ≈ baseline BEFORE 33/129/15/99/18/33) | `shots/dpm-after-*-dark-enhanced-1280.png` |
| Light | Performance | Intacto — primario verde #15803d presente (32 fuentes dashboard ≈ 35 enhanced) | `shots/dpm-after-dashboard-light-perf-1280.png` |
| Light | Enhanced | Intacto — idéntico a Light+Performance en fuentes (35/102) | `shots/dpm-after-dashboard-light-enhanced-1280.png` |

Encapsulado: TODA regla nueva está scopeada a `.mode-performance.dark`
(y `.mode-performance.dark .landing-tokens`); Light+Performance no cambia por
construcción, y Dark+Enhanced solo conserva las reglas F5/F6 preexistentes.

## Responsive (GATE 10) — Dark+Performance

Overflow horizontal (scrollWidth − innerWidth) en 3 vistas × 9 anchos:

| Viewport | Dashboard | POS | Inventario |
|---|---|---|---|
| 320 | 0px | 0px | 0px |
| 360 | 0px | 0px | 0px |
| 375 | 0px | 0px | 0px |
| 390 | 0px | 0px | 0px |
| 400 | 0px | 0px | 0px |
| 768 | 0px | 0px | 0px |
| 1024 | 0px | 0px | 0px |
| 1280 | 0px | 0px | 0px |
| 1440 | 0px | 0px | 0px |

Móvil 390 verificado en vivo: MobileTabBar (6 items, fondo #141414, activo
blanco), StickyCart (botón blanco "VER CAJA"), drawer lateral monocromo,
sin clipping ni pérdida de botones. Capturas: `dpm-after-pos-mobile-390.png`,
`dpm-after-drawer-mobile-390.png`.

## Accesibilidad (GATE 8)

| Verificación | Resultado |
|---|---|
| Focus visible | outline 3px solid rgb(228,228,231) en botones/links (mejora vs verde 2px) — Tab real en Ajustes |
| Keyboard navigation | Tab navega; Escape cierra panel de carrito y drawer (verificado en vivo) |
| Contraste primario | #e4e4e7 sobre #0a0a0a ≈ 15.9:1 (AAA); texto #0a0a0a sobre #e4e4e7 ≈ 15.9:1 |
| Texto gris barrido | #a1a1aa sobre #121212 ≈ 6.9:1 (AA); #d4d4d8 ≈ 10.4:1 |
| Selección | ::selection blanco 0.22 — legible |
| Distinguibilidad sin verde | estados que eran solo-verde conservan icono+texto; semánticos success mantienen token verde; warning/danger conservan cromatismo |
| Disabled/selected/hover/active | verificados visualmente en POS/Inventario (opacity, fondo blanco activo, bordes) |
| aria-labels | intactos (cero cambios de markup) |

## Jerarquía (GATE 7) — Performance NO es "invisible"

- Botón primario blanco #e4e4e7 = MÁS contraste que el verde anterior.
- Escalera de superficies #0a0a0a→#121212→#1a1a1a→#1e1e1e→#2a2a2a intacta.
- Bordes strong #3f3f46 para affordances que antes usaban bordes verdes.
- Focus/selected destacan en blanco; estados destructivos/warning mantienen hue.
