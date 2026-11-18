# ADN-LANDING-HERO-AND-PAGER-FIX-004 — Validación visual responsive

**Fecha:** 2026-11-19 · **Método:** Playwright/Chromium headless contra
`localhost:3000` (PM2 + .env principal). Capturas íntegras en `evidencia-004/`.

## Viewports validados

| Viewport | Overflow-H | Firma ADNegocio visible | Descendentes (g) íntegras | CTAs alcanzables | Paginador | Captura |
|---|---|---|---|---|---|---|
| 360×740 (móvil pequeño) | NO | SÍ (firma en primer scroll) | SÍ | SÍ (stack vertical) | Oculto <lg — drawer con 5 secciones | `after-hero-360.png` |
| 390×844 (móvil estándar) | NO | SÍ (~52px, legible) | SÍ | SÍ en primer pantallazo | Oculto <lg — drawer OK (test E2E #6) | `after-hero-390.png` |
| 768×1024 (tablet) | NO | SÍ | SÍ | SÍ | Oculto <lg | `after-hero-768.png` |
| 1024×768 (laptop) | NO | SÍ | SÍ | SÍ | Visible, derecho, no invade | `after-hero-1024.png` |
| 1440×900 (escritorio) | NO | SÍ (protagonista) | SÍ (zoom `after-brand-g-zoom-1440.png`) | SÍ | Visible + scrollspy 1→5 | `after-hero-1440.png` |
| **1648×924 (captura del propietario)** | NO | SÍ | SÍ | SÍ | Visible | `after-hero-1648.png` |
| 1920×1080 (amplio) | NO | SÍ | SÍ | SÍ + selector 3 caminos visible | Visible | `after-hero-1920.png` |

## Comprobaciones transversales

- **`prefers-reduced-motion`:** la firma ADNegocio y el titular son visibles
  sin animación desde la primera pintura (`after-reduced-motion-1440.png`);
  el reveal por máscara se desactiva (`reduceMotion ? false`).
- **Sin saltos de composición:** la pila marca→promesa→CTAs abraza el titular
  en los 7 tamaños; la escena N.01–N.04 no colisiona con el titular ni con el
  selector de caminos.
- **Navegador lateral (≥lg):** los 5 puntos navegan a su sección exacta con
  `scroll-mt-[76px]`; el punto activo refleja la sección visible (scrollspy
  por posición); teclado 1-5; `aria-current` + `aria-label`; área táctil
  ≥ 44px con etiquetas al hover.
- **Móvil:** el navegador lateral no invade (oculto <lg por diseño
  pre-existente); la navegación de las 5 secciones se conserva en el drawer
  (botones ≥44px) — verificado por test E2E #6.
- **Firma del hero:** `pb-[0.3em]` de máscara cubre la descendente de la «g»
  de Space Grotesk (zoom verificado a 1440); sin recortes de tinta en ningún
  viewport.

## Resultado: PASS en las 7 resoluciones + reduced-motion
