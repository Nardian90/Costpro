# BEFORE_AFTER_COMPARISON — Comparativa de las cuatro zonas (capturas verificadas)

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §8 · **Fecha:** 2026-11-18

Metodología: Playwright/Chromium contra el servidor local real (`http://localhost:3000`,
PM2 + .env principal, health 200). Consentimiento de cookies pre-aplicado vía
`localStorage` para no tapar zonas. Misma batería de capturas ANTES y DESPUÉS
(`scripts/shot_003.cjs before|after`). Validación en navegador real, no solo inspección
de CSS.

## Zona 1 — Logotipo del hero (header)

| | ANTES | DESPUÉS |
| --- | --- | --- |
| Captura | `evidencia-003/before/zoom-logo-header.png` | `evidencia-003/after/zoom-logo-header.png` |
| Estado | Wordmark SVG blanco con «g» sin descendente (se leía «ADNeaocio»); tratamiento distinto al sidebar | «ADN» verde + «egocio» blanco (BrandWordmark), idéntico al menú lateral autenticado, palabra íntegra |

## Zona 2 — Descendente de la «g» (titular)

| | ANTES | DESPUÉS |
| --- | --- | --- |
| Captura 1440 | `evidencia-003/before/zoom-negocio-g.png` | `evidencia-003/after/zoom-negocio-g.png` |
| Captura 390 | `evidencia-003/before/zoom-negocio-g-390.png` (crop en `04-titular-g-390-before.png`) | `evidencia-003/after/zoom-negocio-g-390.png` |
| Estado | Cola inferior de la «g» de «negocio.» cortada a ras | Bucle inferior completo; verificado además numéricamente (margen +10.7 a +31.3 px en 6 viewports — ver DESCENDER_G_CLIPPING_FIX.md) |

## Zona 3 — Sección «ventas en cuadernos…»

| | ANTES | DESPUÉS |
| --- | --- | --- |
| Captura | `evidencia-003/before/05-problemas-1440-before.png` | `evidencia-003/after/zoom-scene.png` (1440) · `after/zoom-scene-1024.png` (1024) |
| Estado | 4 chips idénticos con `line-through` flotando en bucle vertical infinito (`y:[0,-6,0] repeat:Infinity`) | Escena editorial ESTÁTICA: papel pautado, hoja de control, anotación «a ojo» subrayada, burbuja de chat, numeración N.01–N.04, marcas de registro, pie «Lo disperso — un solo sistema». Sin bucles ni animación alguna |

## Zona 4 — Funcionalidades

| | ANTES | DESPUÉS |
| --- | --- | --- |
| Capturas | `evidencia-003/before/07-features-1440-before.png` · `08-features-tall-1440-before.png` | `evidencia-003/after/08-features-tall-1440-after.png` · `09-features-390-after.png` · `10-features-768-after.png` |
| Estado | Header pegado al borde izquierdo (`px-2`), texto `max-w-2xl`, filas `max-w-3xl` — tres retículas incoherentes y gran vacío derecho | Una retícula: contenedor `max-w-[1360px]` centrado con los márgenes del hero; header 12-col (título 7 + descripción 5 con hairline); índice a 2 columnas con el mismo gutter. Márgenes medidos Δ0 en 6 viewports |

## Favicon

| | ANTES | DESPUÉS |
| --- | --- | --- |
| Evidencia | isotipo ADN con A y N recortadas (paths fuera del viewBox 512; ver FAVICON_ADN_OR_N_DESIGN.md §1) | `evidencia-003/favicon-legibility-review.png` (N a 16/32/48 vs ADN a 16) · `opcion2-n-*.png` |
| Estado | Letras recortadas en todas las variantes PNG/SVG | N geométrica verde con punto blanco, legible a 16px, sincronizada en favicon.svg/ico + logo + icon + manifest + apple-touch + PWA FC + metadata |

## Preservado sin cambios (dirección aprobada en 001/002)

Titular «MENOS MALABARES. / MÁS negocio.» con su reveal tipográfico; retícula
estructural del hero; cinta de módulos reales; tres caminos FIX-ENTRY intactos; CTAs
verdes sólidos; promo; paleta negro/blanco/verde; aislamiento de temas internos
(Performance/Enhanced) sin tocar.
