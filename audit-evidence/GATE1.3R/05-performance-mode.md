# GATE 1.3R.1 — 05 PERFORMANCE MODE (GATE 2 · §12–§14)

## §12 — Localización de FIX-PERF-BG con `#0a0a0a`

`src/styles/modes.css` — superficies que forzaban `#0a0a0a` en `.mode-performance.dark`:

| Línea | Superficie | Valor previo |
|---|---|---|
| L51 | `.mode-performance.dark` (fondo raíz) | `#0a0a0a` |
| L68 | sidebar-container / [data-sidebar] / aside/nav sidebar | `#0a0a0a` |
| L90 | main / [role=main] / .terminal-main / .main-content | `#0a0a0a` |
| L140 | `[class*="bg-background"]` | `#0a0a0a` |
| L173 | reemplazo de gradientes verdes inline | `#0a0a0a` |

Token dark ESTÁNDAR de la app (`src/styles/tokens.css` L227):
`--background: #121212; --background-solid: #121212` ("Zed-style dark gray").
El SIDEBAR dark estándar SÍ es `--sidebar: #0a0a0a` (L274).

## §13 — Corrección (FIX-PERF-BG-V6)

Solo las 4 superficies de FONDO pasan a `var(--background-solid, #121212)`:
raíz (L51), main (L90), `bg-background` (L140), gradiente-verde-reemplazo (L173).

NO se tocó (no era el fondo pedido y coincide con estándar/optimizaciones):
- Sidebar `#0a0a0a` == token `--sidebar` dark estándar.
- Cards `#141414`, muted `#1a1a1a`, popover `#141414` (sólidos propios del modo).
- Sin animaciones/transiciones/backdrop-filter: optimizaciones del modo intactas.

## §14 — Validación Dark vs Performance (browser real, `06-sales-navigation.json`)

| Medición | Dark estándar (enhanced) | Performance (fix aplicado) |
|---|---|---|
| body bg | `rgb(18, 18, 18)` | html/main `rgb(18, 18, 18)` |
| sidebar bg | `rgb(10, 10, 10)` | `rgb(10, 10, 10)` |
| mode class | `mode-enhanced` + `dark` | `mode-performance` + `dark` |
| overflow horizontal | 0 px (1440/1280/1024) | 0 px (1440/1280/1024/390/375) |

**El fondo de Performance ya es idéntico al dark estándar (#121212); `#0a0a0a` solo persiste
donde el estándar también lo usa (sidebar).**

Capturas: `cap-dark-1440/1280/1024.png`, `cap-performance-mode-1440.png`,
`cap-performance-1280/1024/390/375.png`.

Jerarquía/contraste/sidebar/cards/modales preservados — sin rediseño del modo.
