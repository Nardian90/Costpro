# FAVICON_ADN_OR_N_DESIGN — Favicon ADNegocio: ADN compacto vs N geométrica

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §7 · **Fecha:** 2026-11-18

## 1. Defecto reportado

El favicon intentaba mostrar «ADN», pero **las letras se recortaban**. Investigación de
los archivos reales que carga el navegador:

| Archivo | Estado ANTES |
| --- | --- |
| `public/logo.svg` (referenciado por `layout.tsx` como icon) | Isotipo ADN con las tres letras **fuera del viewBox**: la tinta va de x=−18.96 a x=530.96 sobre un lienzo de 512 → la **A se recorta por la izquierda y la N por la derecha** |
| `public/icon.svg` | Mismo SVG recortado |
| `public/logo.png`, `public/icons/icon-{48,72,96,144,192,512}.png`, `public/icons/icon-512-maskable.png`, `public/apple-touch-icon.png`, `public/fc/icons/*.png` | Rasterizados del mismo SVG → **todas las variantes heredaban el recorte** |
| `public/favicon.ico` | **No existía** (el navegador pedía `/favicon.ico` → 404) |
| `public/manifest.json` | Apuntaba a los PNG recortados (mismas rutas) |

## 2. Opción 1 — ADN compacto (evaluada y descartada con evidencia)

Se reconstruyó un monograma ADN con márgenes internos correctos (letras escaladas a
cabida 464px, centradas, sin recorte). El problema no es el ajuste sino la **física del
tamaño**: las letterforms ADN tienen relación de aspecto 2.9:1; a 16×16 px las tres
letras miden ~5 px de alto con trazos de ~0.6 px después de la rasterización.

Evidencia: `evidencia-003/opcion1-adn-16px.png` — a 16px la marca es una mancha
ilegible (solo la «A» se insinúa). **Descartada** conforme al propio mandato: «si las
tres letras no son claramente legibles a tamaño favicon, utiliza únicamente una N».

## 3. Opción 2 (aprobada) — N geométrica original

Diseño **propio de ADNegocio** — inspirado en la *lógica* angular del mandato
(recomposición de una estructura tipo «Z» girada ~90° hacia una «N»), sin copiar trazado,
SVG ni proporciones de terceros:

- **Lienzo** 512×512, tile `rx=100` con el negro de marca `#05070A`.
- **N en verde neón `#22C55E`**: dos peces verticales (x 104–184 y 328–408, ancho 80,
  altura 104–408) unidos por una **diagonal paralela de grosor constante 80**
  (polígono `104,104 → 184,104 → 408,408 → 328,408`) — empalmes limpios a tope con los
  peces, sin serifas ni curvas.
- **Punto-cuadrado blanco 46px** en el contracampo superior derecho — eco del «punto»
  del sistema de marca (el punto de la «i» del wordmark) y diferenciador frente a una
  letra tipográfica genérica.
- Márgenes internos del glifo ≥ 96px (18.75% del lienzo) → nada cortado a 16/32/48px.
- **Monocromo**: la marca funciona con una sola tinta
  (`brand/adnegocio-n-favicon-mono.svg`) — misma forma, punto incluido.

Legibilidad verificada: `evidencia-003/favicon-legibility-review.png` — comparación a
16/32/48px (con ampliación nearest-neighbor): la N es inequívoca incluso a 16px, con el
punto blanco visible; `opcion2-n-16px/32px/48px.png` son los renders exactos.

## 4. Sincronización de TODAS las variantes

Regeneradas con `scripts/gen_favicon_003.cjs` (sharp, SVG único → todas las variantes
del MISMO diseño aprobado):

| Variante | Archivo(s) |
| --- | --- |
| SVG favicon (canonical) | `public/favicon.svg` (nuevo) |
| SVG legado sincronizados | `public/logo.svg` · `public/icon.svg` |
| Favicon ICO | `public/favicon.ico` (nuevo; marcos 16/32/48) |
| PNG tile | `public/logo.png` (512) · `public/icons/icon-{48,72,96,144,192,512}.png` |
| Maskable PWA | `public/icons/icon-512-maskable.png` · `public/fc/icons/icon-maskable-{192,512}.png` (fondo a sangre completa + glifo a escala 0.84 dentro de la zona segura circular de 205px) |
| Apple touch | `public/apple-touch-icon.png` (180×180, RGB plano) |
| PWA Ficha de Costo | `public/fc/icons/icon-{192,512}.png` (mismos diseños; el manifest de FC ya apuntaba a estas rutas) |
| Metadatos | `src/app/layout.tsx` → `icons.icon = [favicon.svg, favicon.ico 48x48, icons/icon-192.png]`, `icons.apple = /apple-touch-icon.png` |

El `manifest.json` principal conserva sus rutas (`/icons/icon-192.png`,
`/icons/icon-512.png`) — ahora con el contenido nuevo. No queda ninguna variante con el
isotipo ADN recortado.

## 5. Verificación HTTP (navegador real)

`responsive_003_metrics.json → faviconHttp`: `/favicon.svg` (200, image/svg+xml),
`/favicon.ico` (200, image/x-icon), `/icons/icon-192.png` (200), `/apple-touch-icon.png`
(200), `/fc/icons/icon-192.png` (200). El HTML servido declara los `<link rel="icon">`
correspondientes (capturado en la misma métrica: `faviconLinks`).
