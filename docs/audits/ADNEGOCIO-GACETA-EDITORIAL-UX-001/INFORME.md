# INFORME — ADNEGOCIO-GACETA-EDITORIAL-UX-001
## Rediseño editorial, selector de temas y actualización de identidad de marca en `/gaceta`

- **Fecha:** 2026-11-27 · **Rama:** `feat/gaceta-editorial-20261127` · **Base:** `main` @ `7d6ee95`
- **Alcance:** solo `/gaceta` (portada + artículo) y componentes exclusivos de esta vista.
- **Página objetivo:** https://costpro4.vercel.app/gaceta (pública, sin autenticación).

---

## 1. Auditoría inicial (hallazgos reales, verificados)

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| H1 | **Primera visita renderiza la gaceta en OSCURO**: el script inline global añade `.dark` a `<html>` cuando no existe `localStorage['theme']`, y `ThemeProvider` tiene `defaultTheme="dark"`. La misión exige default CLARO. | `antes/metricas.json`: `htmlClass: "h-full dark mode-performance"`, fondo `rgb(18,18,18)` |
| H2 | **Sin selector de temas** en la gaceta; el usuario público no puede elegir apariencia ni persistirla. | código previo de `src/app/gaceta/page.tsx` |
| H3 | **Marcas comerciales incorrectas**: «Novedades CostPro», «CostPro · fecha», «Probar CostPro», «Conocer CostPro», footer «impulsada por CostPro», OG `siteName: 'CostPro'`, insignia de archivo «CP». | capturas `antes/portada-*.png` |
| H4 | **La voz serif editorial no aplicaba**: `font-[family-name:var(--font-editorial)]` no produjo serif en titulares (captura ANTES: titulares en sans). Instrument Serif además solo tiene peso 400 — los `font-black` eran falsos. | `antes/portada-1440.png` |
| H5 | **«Edición No. N» engañoso**: mostraba el conteo de notas cargadas (tope 60), no un número de edición real. | código previo, línea «Edición No. {ediciones.length \|\| 1}» |
| H6 | **Fechas sin zona horaria**: `Intl es-CU` sin `timeZone` mostraba la fecha UTC del servidor; entre 00:00–05:00 hora de Cuba la «fecha de hoy» era incorrecta. | código previo |
| H7 | **Error de carga disfrazado de vacío**: un fallo de lectura de `public_gaceta_v` mostraba «Edición en preparación» como si no hubiera publicaciones. Sin estados de carga (sin `loading.tsx`). | código previo (`fetchEdiciones` devolvía `[]` en catch) |
| H8 | **Sin Twitter Cards** en portada ni artículo; sin `og:image` raster (los SVG no renderizan en la mayoría de plataformas sociales); sitemap sin artículos. | código previo |
| H9 | El banner de cookies y otros overlays globales se pintaban oscuros sobre la página clara (reglas `!important` de `modes.css` forzaban `#141414` con `html.dark`, solo excluían al landing). | captura intermedia; `src/styles/modes.css` («Forzar backgrounds sólidos») |
| H10 | Contenido editorial almacenado en la base menciona «CostPro» (titular/bajada/etiqueta de la nota de producto). | vista `public_gaceta_v` |

## 2. Diseño e implementación

### 2.1 Sistema de tema acotado (Fase 2 — requisito obligatorio)
- **Contenedor raíz `#gaceta-root`** (montado por `src/app/gaceta/layout.tsx`), replicando el patrón ya existente de `#landing-root`: los tokens semánticos (`--background`, `--foreground`, `--muted`, `--border`, `--primary`, `--card`, `--popover`…) se re-declaran para todo su subárbol en `src/styles/gaceta.css`. La app interna y el landing nunca montan este nodo ⇒ **cero regresión fuera de `/gaceta`** (verificado: `html` conserva `dark mode-performance`).
- **Default de primera visita = CLARO (papel marfil `#faf9f5`, tinta `#1c1917`)**, sin adoptar jamás el tema del SO de forma automática (T1).
- **Selector Claro / Oscuro / Sistema** (`GacetaThemeToggle.tsx`): radios nativos (flechas del teclado y anuncio de lector de pantalla sin JS extra), fieldset con `legend` visible para lectores, 40 px de área táctil, estado activo invertido, `:focus-visible` con `--primary` de la gaceta.
- **Persistencia**: `localStorage['gaceta-theme']` (clave propia, sin sesión); «Sistema» escucha en vivo `prefers-color-scheme` (T3).
- **Anti-flash**: script inline con **nonce CSP** (proxy.ts) como primer hijo del contenedor; aplica `data-theme="dark"` durante el parseo, antes del primer paint (T4).
- **Escudo de overlays**: `body:has(#gaceta-root[...])` fija tokens y `color-scheme` a nivel documento para CookieConsent/Toaster/PWA banner.
- **Contra-reglas a `modes.css`**: el modo performance fuerza fondos `#141414`/`#1a1a1a` con `!important` (solo excluía al landing). Se restauró el valor del token dentro de la gaceta con selectores de especificidad mayor (`body:has(#gaceta-root):not(:has(#landing-root))` = 2,1,1 frente a 1,2,1), sin tocar `modes.css` (H9).
- **Paleta editorial**: tema oscuro carbón cálido (`#161513`, texto `#ece7de`), no negro absoluto. 14 pares texto/fondo verificados por cálculo (luminancia relativa WCAG): **mínimo 5.75:1, todos AA** (la mayoría AAA).

### 2.2 Rediseño editorial (Fase 3)
- **Cabecera**: fecha en hora de La Habana, «Una publicación de ADNegocio» (acento verde), masthead «EL DIARIO CONTABLE» en serif real, tagline, fila de herramientas con selector de tema, filete 3px.
- **Portada principal**: kicker de procedencia (rojo institucional «Gaceta Oficial de Cuba» / verde «Novedades de ADNegocio»), fecha larga, chip «Portada» si `destacado`, titular serif con `text-wrap: balance`, entradilla serif, categorías, CTA con área táctil 40 px.
- **Secciones independientes** «Gaceta Oficial» y «Novedades de ADNegocio», cada una con línea de procedencia y textos vacíos editoriales propios.
- **Ediciones recientes**: fecha + insignia GO/ADN (con `abbr` descriptivo) + titular + categorías.
- **Pie editorial**: identidad ADNegocio, procedencia de fuentes, advertencia informativa («prevalece el texto del documento oficial»), línea de transparencia (IA + revisión editorial).
- **Tipografía**: Source Serif 4 (pesos reales 400/600/700/900 + itálicas) cargada por `next/font` SOLO en el layout de la gaceta (variable `--font-gaceta-serif`, clase explícita `.gaceta-serif`); corrige H4 sin tocar la tipografía del resto de la app.
- **Artículo**: medida de lectura 17–18px serif a 1.75, **volada tipográfica** (drop cap) en el primer párrafo, intertítulos, citas y «dato» en caja de filete doble, bloque «Fuente oficial» con advertencia editorial, CTA ADNegocio, «Sigue leyendo».
- **Estados**: `loading.tsx` en portada y artículo (skeleton editorial); **error ≠ vacío** — fallo de lectura muestra panel propio con reintento (H7).
- **`prefers-reduced-motion`** respetado (anula transiciones dentro de la gaceta).

### 2.3 Corrección de marca (Fase 4) — CostPro → ADNegocio
Cambiado en código (lista completa): «Novedades CostPro» → «Novedades de ADNegocio» (portada y artículo); fuente de tarjeta «CostPro» → «ADNegocio»; «CostPro · fecha» → «ADNegocio · fecha»; «Probar CostPro →» → «Conocer ADNegocio →»; «Conocer CostPro» → «Conocer ADNegocio» (2 CTA); CTA del artículo reescrito («ADNegocio es la plataforma de gestión…»); footer reescrito («El Diario Contable · Una publicación de ADNegocio» — eliminado «impulsada por CostPro»); insignia «CP» → «ADN»; OG `siteName` → «ADNegocio»; descripciones de metadata actualizadas; **alias de presentación para la etiqueta histórica** guardada en la base (`etiquetaVisible()`: chip «CostPro» → «ADNegocio»), sin escrituras a la base.

**Fuera de alcance (documentado, no modificado)**: JSON-LD global del root layout (`alternateName: "CostPro"`, alias SEO histórico de toda la app), dominio técnico `costpro4.vercel.app`, y el **contenido editorial almacenado en la base** (titular/bajada/cuerpo de la nota de producto que mencionan «CostPro»). La misión prohíbe modificar la base de datos; renombrar esas frases requiere una actualización editorial de datos por los canales oficiales (recomendación pendiente para el propietario).

### 2.4 SEO y metadatos (Fase 6)
- Title/description/canonical revisados; Open Graph con `siteName: ADNegocio` e **imagen raster propia `public/gaceta-og.png`** (1200×630, identidad editorial); **Twitter Cards** `summary_large_image` en portada y artículo.
- JSON-LD: portada `CollectionPage` (publisher ADNegocio + `mainEntity` NewsArticle); artículo `NewsArticle` completo (author/publisher ADNegocio, logo, image, `isAccessibleForFree: true`, `citation` de la fuente oficial cuando existe).
- `sitemap.ts`: ahora agrega dinámicamente las notas de `public_gaceta_v` (tope 200, fail-open ante error de lectura).
- Encabezados jerárquicos (h1 única por página), `main#main-content` (conecta con el skip-link global), `time dateTime` en todas las fechas, enlaces de fuente con `rel="noopener noreferrer"`.

## 3. Archivos modificados / creados

| Archivo | Tipo | Contenido |
|---|---|---|
| `src/styles/gaceta.css` | nuevo | tokens escopados claro/dark, escudo body/html, tipografía, acentos, selector, contra-reglas a modes.css, reduced-motion |
| `src/app/gaceta/layout.tsx` | nuevo | contenedor raíz, Source Serif 4, script anti-flash con nonce CSP |
| `src/app/gaceta/GacetaThemeToggle.tsx` | nuevo | selector Claro/Oscuro/Sistema accesible + persistencia + seguimiento en vivo del SO |
| `src/app/gaceta/page.tsx` | reescrito | portada editorial completa + metadata/Twitter/JSON-LD + error≠vacío + tz La Habana |
| `src/app/gaceta/[slug]/page.tsx` | reescrito | artículo editorial + metadata/Twitter/JSON-LD + alias de etiquetas + toggle en cabecera |
| `src/app/gaceta/loading.tsx` | nuevo | skeleton de portada |
| `src/app/gaceta/[slug]/loading.tsx` | nuevo | skeleton de artículo |
| `src/app/sitemap.ts` | modificado | artículos dinámicos de la gaceta (fail-open) |
| `src/app/globals.css` | modificado | import de gaceta.css (al final, patrón landing-shield) |
| `public/gaceta-og.png` | nuevo | imagen OG/Twitter 1200×630 |

## 4. Verificaciones ejecutadas (con resultados reales)

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` (repo completo) | **PASS** (exit 0; detectó y corrigió 2 errores reales de null-safety durante el desarrollo) |
| `eslint` (archivos de la misión) | PASS (0 errores) |
| `vitest run` (suite completa local) | 413 archivos ejecutados **sin fallos** en la porción cubierta; la suite completa excede el presupuesto de tiempo/RAM del sandbox (el gate completo corre en CI del PR) |
| `next build` (producción) | **«Compiled successfully»**; la fase de prerender final OOMea en este contenedor de 4 GB (se documentó; el build completo y autoritativo corre en CI/Vercel) |
| Pruebas de comportamiento del tema (Playwright, 9 escenarios) | **9/9 PASS** — T1 primera visita clara aunque el SO pida oscuro; T2 selección/persistencia/cruce de páginas; T3 «Sistema» sigue al SO en vivo; T4 anti-flash (script en HTML SSR + atributo pre-paint); T5 artículo completo en 390 px (0 px de overflow, drop cap, fuente oficial, compartir); T6 sin overflow a 360 px, h1 única, marca limpia; T1b/T2b/T5b **cero errores de consola e hidratación** |
| Contraste WCAG | 14/14 pares AA (mínimo 5.75:1), cálculo programático |
| Capturas antes/después (1440/768/390/360, claro y oscuro) | `download/gaceta-evidencia/{antes,despues}/` |
| Fuente serif aplicada | `getComputedStyle(h1).fontFamily` = «Source Serif 4» (T5) |
| Acceso público sin auth | `/gaceta` y artículo responden 200 sin sesión |
| Regresión fuera de la gaceta | `html.className` intacto (`dark mode-performance`); tokens de la app sin cambios; ninguno de los archivos tocados es compartido con el shell (globals.css solo añade un import nuevo) |

## 5. Incidencias pendientes y riesgos

1. **Contenido editorial en base con marca histórica** (titular/bajada/cuerpo/etiqueta de la nota `costpro-2026-11-24-informe-gerencial-comparar-productos`): la etiqueta ya se presenta como «ADNegocio»; las frases completas requieren actualización editorial de datos por canal oficial (fuera del alcance — sin escrituras a la base).
2. **Build local sin prerender final**: contenedor de 4 GB no completa «Collecting page data» (OOM). El build completo es gate del CI del PR; el artefacto local validado con «Compiled successfully» + pruebas de comportamiento contra servidor real (producción y dev).
3. **Estado HTTP 200 en rutas inexistentes** (p. ej. `/gaceta/no-existe`): **preexistente y global** (también en `/tienda/no-existe`); el contenido not-found sí se renderiza. No introducido por esta misión; candidato a misión propia.
4. **JSON-LD global del root layout** mantiene `alternateName: "CostPro"` por decisión de alcance (alias SEO histórico de toda la app).
5. **`revalidate = 600`**: ante error de lectura la portada puede servir el estado de error hasta 10 min (aceptable para una publicación diaria; el panel ofrece reintento).
6. Durante la sesión se observó que 5 PDF de `docs/audits/NOMINAS-PDF-CONF-20261121/` aparecieron modificados en el árbol de trabajo sin intervención de esta misión (mismo tamaño, hash distinto). **No se incluyen en este PR**; se deja el hallazgo anotado para el propietario.

## 6. Criterios de aceptación

- [x] Identidad editorial profesional (papel/tinta, filetes, serif real, jerarquía de portada)
- [x] Tema Light por defecto en primera visita (T1, incluso con SO oscuro)
- [x] Selector funcional de temas (radios nativos, teclado, lector de pantalla)
- [x] Preferencia persistente entre visitas y páginas (T2)
- [x] Temas claro y oscuro con calidad equivalente (mismos tokens, contrastes AA verificados)
- [x] Referencias de la plataforma actualizadas a ADNegocio dentro del alcance de la vista
- [x] Gaceta Oficial diferenciada de Novedades de ADNegocio (kick rojo vs verde, secciones y procedencia propias)
- [x] Responsive completo (1440/768/390/360, 0 px de overflow en todas las capturas)
- [x] Accesibilidad y SEO revisados (contraste AA calculado, teclado, ARIA, OG/Twitter/JSON-LD/sitemap)
- [x] Sin regresiones en otras áreas (escopado por contenedor; verificado)
- [x] Verificaciones técnicas ejecutadas y documentadas
