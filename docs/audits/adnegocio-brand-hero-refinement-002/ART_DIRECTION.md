# ADN-BRAND-HERO-REFINEMENT-002 — Dirección de arte del hero ADNegocio

**Misión:** ADN-BRAND-HERO-REFINEMENT-002 · **Fecha:** 2026-11-18 · **PR:** #1651 (rama `feat/adnegocio-brand-rebuild-001-20261118`)
**Alcance:** rediseño creativo real del hero del landing de ADNegocio, aplicado en código (sin mockups), corrección de identidad «ADN ADNegocio» y elevación del nivel visual a estándar Awwwards.

---

## 1. Problema detectado (estado «antes» — ver `before-hero-1440.png`)

| # | Problema | Causa raíz en el código |
|---|----------|------------------------|
| 1 | El landing mostraba «ADN ADNegocio» | `HeroSection` renderizaba `<AdnIsotipo>` (tile con las letras ADN) **junto a** `<BrandWordmark>` (texto «ADNegocio») en el mismo bloque de identidad |
| 2 | Logotipo pequeño y poco atractivo | Wordmark a `text-2xl/3xl` y wordmark del header a 17 px, con cambio de estado a icono `Shield` genérico cuando no había scroll |
| 3 | Titular sin personalidad | «Todo tu negocio. En un solo lugar.» centrado, tamaño convencional (7xl), sin composición ni voz tipográfica |
| 4 | Sin fuerza premium / plantilla genérica | Foto de fondo con Ken Burns + 5 orbes verdes + partículas: acumulación de efectos sin función; composición centrada tipo plantilla |
| 5 | Sin elemento visual memorable | Nada diferenciaba a ADNegocio de cualquier SaaS oscuro con acento verde |

## 2. Referencias Awwwards verificadas (2024-2026)

Metodología: páginas de categorías y fichas verificadas por el agente de investigación contra `awwwards.com` (HTTP 200) y, cuando fue accesible, el HTML/CSS de los sitios en vivo. **No se copió ningún sitio**; se adaptan recursos, no diseños.

| Referencia | Reconocimiento | Recurso verificado | Aplicado en ADNegocio como |
|---|---|---|---|
| **Grids** (Obys Agency) — `awwwards.com/sites/grids-1` | Site of the Day, 02-11-2026 | Retícula estructural visible; tracking −0.02 a −0.06em | `.hero-grid-bg`: retícula de hairlines con máscara radial detrás del titular |
| **Cyera AI Guardian** — `awwwards.com/sites/cyera-ai-guardian` | Site of the Day, 11-11-2026 | Mezcla sans («Haffer») + serif («Season») en B2B | Contraste sans monumental (Archivo) + serif de acento (Instrument Serif) en «negocio.» |
| **Anduril Industries** — `awwwards.com/sites/anduril-industries-1` | Nominee, 12-11-2026 | Display monumental, tracking hasta −0.1em, dark tech | Tracking −0.045em, peso 900, `font-stretch:125%`, composición dark sin adornos |
| **North** (`north.cloud`) — `awwwards.com/sites/north-2` | Nominee, 14-11-2026 | Titular «declaración de categoría» + microcopy mono sobre el H1 | Eyebrow mono «Plataforma de gestión empresarial — multi-tienda» con dot verde |
| **Greenlock** — `awwwards.com/sites/greenlock-2` | Nominee, 12-11-2026 | Serif + grotesk en dark con acento verde B2B financiero | «negocio.» en serif italic verde #22c55e; una sola voz de acento |
| **Bridgement** — `awwwards.com/sites/bridgement` | Nominee, 18-11-2026 | Microinteracciones sobrias en finanzas B2B | Hovers discretos (flechas que avanzan, chips que se alinean), CTA sólido sin gradiente |
| **Frontier by Planhat** — `awwwards.com/sites/frontier-by-planhat` | Nominee, 15-11-2026 | Cinta/marquee tipográfico como textura informativa | Ticker inferior mono con los módulos REALES (pausa al hover) |
| **Serein Wealth** — `awwwards.com/sites/serein-wealth` | Nominee, 16-11-2026 | Scroll storytelling pineado | (Parcial) jerarquía por fases al salir del hero; el storytelling profundo queda para una siguiente misión |

Patrones transversales de los ganadores verificados: tipografía como estructura (no decoración), dos voces tipográficas máximo (sans+serif o sans+mono), un solo acento de color, retícula y espacio negativo deliberados, movimiento con función narrativa.

## 3. Concepto creativo: «DEL CAOS AL ORDEN»

Titular (dirección de la misión, perfeccionada tipográficamente):

> **MENOS MALABARES.**
> **MÁS *negocio*.**

La animación tipográfica **ES la narrativa** del producto:

1. **«MENOS»** asciende y se asienta (t≈0.12s).
2. **«MALABARES.»** entra DISPERSO — cada letra parte de offsets fijos (array determinista, sin `Math.random`: hidratación estable) con rotaciones de ±8° — y **se ordena en la línea base** con spring escalonado (t≈0.30→0.72s). Las operaciones dejan de estar dispersas: el mensaje es la animación.
3. **«MÁS negocio.»** asciende tras máscara (t≈0.92s) — la promesa llega cuando el caos ya se ordenó; el acento verde es el remate, no el inicio.

Semántica visual: lo que se abandona («MALABARES.») queda **en hueco** (`-webkit-text-stroke`, con fallback `@supports`); lo que se gana («negocio.») es **sólido, serif y verde**. El hueco/sólido no es decoración: es la diferencia entre el caos y el sistema.

Pieza memorable complementaria (desktop ≥lg): **chips «del caos al orden»** — «ventas en cuadernos», «inventario en papel», «costos a ojo», «deudas en chats» entran dispersos alrededor de un eje verde, se alinean en una sola columna, se tachan y reciben un check verde. Caption: «LO DISPERSO — UN SOLO SISTEMA». Dolor real del micro/negocio, abstracto, sin marcas de terceros ni estadísticas inventadas (cumple la prohibición de la misión 001).

Cinta editorial inferior: los **9 dominios reales** de la plataforma (estados financieros, ventas, punto de venta, inventario, almacén, compras, proveedores y clientes, ficha de costo, multi-tienda, reportes y analítica, documentos) en mono 10px — ritmo editorial con información verdadera.

## 4. Corrección definitiva de la identidad (misión §3)

| Regla de la misión | Implementación |
|---|---|
| No mostrar «ADN ADNegocio» | Eliminado el lockup `<AdnIsotipo>+<BrandWordmark>` del hero; test de contrato lo blinda (`not.toContain('AdnIsotipo')`, `not.toContain('BrandWordmark')` en HeroSection) |
| No colocar ADN como texto junto al nombre | El símbolo ADN queda reservado a favicon/PWA/rail (`AdnMonograma`/isotipo tile); ausente del landing visible |
| Una única versión coherente del wordmark en el encabezado | `<AdnWordmark height={18}>` SVG SIEMPRE visible (sin cambio de estado a Shield), con ancla «volver al inicio» |
| No repetir el nombre completo en el mismo bloque | El hero no contiene el nombre; la marca vive en el header. El eco del descriptor («negocio.») es el titular, no un lockup |
| El descriptor «NEGOCIO» solo en variante gráfica autónoma | Sin cambios: `AdnLogo` (ADN+NEGOCIO) sigue disponible para superficies propias; nunca combinado con el nombre |

## 5. Sistema tipográfico resultante

| Voz | Fuente | Uso |
|---|---|---|
| Display monumental | **Archivo** variable, peso 900, `font-stretch:125%` (eje wdth), tracking −0.045em | Titular del hero (`--font-display`) |
| Editorial de acento | **Instrument Serif** italic 400 | «negocio.» — UNA palabra del titular (`--font-editorial`) |
| Técnica/mono | Geist Mono (ya en el sistema) | Eyebrow, labels 01/02/03, chips, ticker, ⌘K |
| Texto | Inter (ya en el sistema) | Subtítulo y descripciones |

Ambas fuentes nuevas se auto-alojan vía `next/font` (`layout.tsx`) con fallback a Space Grotesk/Geist: si la descarga falla, el hero degrada con elegancia sin romper jerarquía.

## 6. Qué se eliminó (calidad ≠ acumular efectos)

- Foto de fondo con Ken Burns + parallax (`fondo-landing.webp`) → sustituida por retícula + un glow verde + un contrapeso neutro.
- 5 `GreenOrb` dispersos (ruido) → eliminados; las partículas `ParticleRain` se conservan (gateadas por `mode-enhanced`, pausadas fuera de pantalla, respetan reduced-motion).
- `TypewriterText` (código muerto) → eliminado.
- Gradiente del CTA (`linear-gradient(135deg,#15803d…)`) → verde sólido de marca con sombra controlada.
- Banner promo brillante con shimmer → barra editorial oscura con dot verde y texto mono.

## 7. Accesibilidad y rendimiento

- `h1` con texto `sr-only` completo («MENOS MALABARES. MÁS NEGOCIO.»); la capa visual (letras separadas) es `aria-hidden` — el nombre accesible no se fragmenta.
- `prefers-reduced-motion`: sin dispersión de letras (`useReducedMotion` → `initial:false`), ticker estático (media query CSS), sin flotación de chips, scroll-to-top sin `smooth`.
- Solo transform/opacity animados (GPU); offsets deterministas; IntersectionObserver pausa el canvas fuera de pantalla (heredado de 001).
- Contraste: verde #22c55e sobre #05070A ≈ 8.6:1; blanco/55 ≈ 9:1 (texto grande); ticker decorativo marcado `aria-hidden` (los módulos reales están en `#features`).
- Foco visible con ring en todos los interactivos; targets ≥44px conservados.
