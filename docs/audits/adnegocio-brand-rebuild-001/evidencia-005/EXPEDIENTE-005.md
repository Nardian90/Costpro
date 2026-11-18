# ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005 — Expediente visual y técnico

**Misión:** evolución del landing hacia una experiencia inmersiva de navegación por escenas («una experiencia, cinco actos»), dirección artística orientada a Awwwards.
**Rama:** `feat/adn-landing-cinematic-scroll-005-20261119` · base `origin/main` `2a7f95111` (PR #1654 de la misión 004 ya fusionado — merge `06c596acd`).
**Fecha:** 2026-11-19.

## 1. Estado real recuperado (§2)

- Misión 004 **FUSIONADA** en main (PR #1654, merged 2026-11-18T20:31Z): se parte de `origin/main` actualizado, sin PRs abiertos que respetar.
- Stack real: framer-motion 12.x (useScroll/whileInView ya en uso), three (Building3DCanvas), embla. **Sin GSAP/Lenis/ScrollSmoother** → sin conflictos previos.
- Bloqueo heredado detectado: `html/body { overflow-x: hidden }` (base.css) **rompe position:sticky en Chromium** — verificado con sonda (sticks=false). Fix: `overflow-x: clip` scopeado a `html:has(#landing-root)` en landing-shield.css (clip no crea scroll container).

## 2. Arquitectura de navegación (§7) — decisión y por qué

**Elección:** escenas fijadas (`position: sticky`) + scrub por progreso real de scroll con `useScroll/useTransform` — el equivalente funcional de `pin + scrub` de ScrollTrigger **sin introducir GSAP ni ninguna dependencia nueva**. El scroll controla las escenas: nada secuestra la rueda ni continúa solo.

Alternativas evaluadas y descartadas:
1. **GSAP ScrollTrigger + Observer (wheel-hijack fullpage.js style)** — el foro GSAP lo recomienda para full-page snap, pero §7 de la misión lo prohíbe explícitamente («bloqueos de rueda… que capturen continuamente el control»).
2. **CSS scroll-snap `y proximity` sobre el scroller raíz** — IMPLEMENTADO y DESCARTADO con evidencia empírica (ciclo 0): con áreas de snap de altura de acto (1–9 viewports) Chromium corregía scrolls programáticos y gestos hacia posiciones arbitrarias (**800→2, 5000→3243**): el sitio luchaba contra el usuario. Nota documentada en landing-shield.css + contrato de tests que lo impide regresar.
3. **Pin de TODOS los actos** — inviable: pricing (1.18vp) y features no caben garantizadamente en 100svh en todas las alturas de escritorio (1024×768) → recorte de contenido prohibido.

**Modelo final por acto:**

| Acto | Contenido | Modo | Transición |
|---|---|---|---|
| 1 · Inicio | Hero editorial (firma ADNegocio + selector de 3 caminos) | `pin` (100svh + runway 85svh) | se repliega (recede: scale 0.93 + fade) mientras el Acto 2 lo cubre; los 4 fragmentos del caos (N.01-N.04) SE RECOGEN hacia la línea ADN |
| 2 · Plataforma | MultiStoreVisual + 7 story-cards (9.4vp) | `handoff` | salida lenta (y 22svh, scale 0.97, piso opacity 0.4) + pasillo 35svh |
| 3 · Funcionalidades | Índice editorial de 8 áreas | `handoff` | igual, el previo persiste bajo la entrada |
| 4 · Precios | 3 planes + comparativa | `handoff` | igual |
| 5 · Ayuda + cierre | FAQ + FinalCTA (cabe en viewport) | `handoff` runway 0 | salida coreografiada en el propio último tramo → footer sin pasillo vacío |

## 3. Firma visual (§5, §C del informe): LA LÍNEA ADN

- **ActPager**: los 5 puntos de la misión 004 convertidos en la firma — hilo vertical verde que se llena con el progreso real de la experiencia, nodos-acto con estado activo pulsante, contador discreto «01 / 05» + nombre del capítulo en vertical.
- **Hairline de entrada por acto** (`.act-hairline`): hairline verde que se dibuja (scaleX, transform-origin right) desde el borde derecho hacia la composición al entrar cada acto — conecta el navegador con la escena.
- Narrativa «del caos al sistema»: el hero muestra la dispersión (cuadernos/papel/a ojo/chats) y la coreografía de salida los RECOGE hacia la línea — «Lo disperso — un solo sistema».

## 4. Ciclos de revisión visual (≥3 exigidos — se ejecutaron 5)

| Ciclo | Hallazgo → corrección |
|---|---|
| C1 | Sonda sticky: `overflow-x:hidden` rompe sticky → fix `clip`. Sticky verificado (la escena se suelta exactamente en el punto matemático 785=85svh). |
| C2 | Hero recortaba el selector de 3 caminos → compresión svh por alturas (v2/v3). |
| C3 | El pasillo handoff de 85svh dejaba ~700px de vacío negro (§12) → pasillo 35svh + piso de opacity 0.4 (nunca vacío). |
| C4 | Acto 5 (<1vp) dejaba pasillo vacío antes del footer → runway 0 (salida integrada). Promo solapado con el header → movido a la raíz como chrome global + spacer 72px. Búsqueda ⌘K y «Explorar» fusionadas en la cabecera del selector. |
| C5 | Verificación final pineada 1440×900: container bottom 818/900 + ticker 897/900 — contenido íntegro sin recortes; 1920×1080: 1069/1080; sin overflow horizontal en 360→1920. |

## 5. Validación técnica

- TypeCheck: `tsc --noEmit` **exit 0**.
- ESLint: **0 errores** (warnings pre-existentes del tipo habitual; 0 en archivos nuevos tras limpieza).
- Vitest completo: **6196/6196 PASS** (455 archivos) — incluye contrato extendido `landing-pager-contract.test.tsx` (18/18) que bloquea: refs huérfanas, snap CSS, dependencias nuevas, ids duplicados.
- E2E Playwright (`playwright.landing.config.ts`): **29/29 PASS** — 23 del paginador (004 + 005) + 6 del spec general. Aterrizajes de los 5 dots: top 61/-11/100/100/100 (tolerancia ±140; scroll-padding-top 100px heredado).
- Build de producción: OOM del sandbox (conocido: 4GB RAM) — lo ejecuta CI (como en 002/003/004).
- Prefers-reduced-motion: sin pin ni scrub (test E2E 12 verifica position≠sticky); móvil <1024: flujo nativo.
- Barra nativa: `scrollbar-width:none` + `::-webkit-scrollbar` scopeados a `html:has(#landing-root)` — la rueda/touch/teclado siguen funcionando (test E2E 11).

## 6. Evidencia

- `before/` — estado previo (misiones 003-004): hero, plataforma, como-funciona, pricing, móvil.
- `journey/` — recorrido completo AFTER (13 capturas: reposo, runway 30%/70%, cobertura, actos 2-5, handoffs, footer) + `geo.json` (geometría real de los actos) + `metrics.json`.
- `responsive/` — hero a 1920×1080, 1440×900 (reposo y pineado), 768×1024.
- `metrics-before.json` / `metrics.json` — alturas antes/después.

## 7. Alcance y límites

- Solo landing + componentes de landing. Módulos internos, auth, Supabase: sin cambios.
- Contenidos conservados al 100%: los 7 story-cards, las 6 áreas de funcionalidades, 3 planes + comparativa, FAQ 7 ítems, FinalCTA, footer, ticker, selector de 3 caminos, búsqueda ⌘K (fusionada con «Explorar» en la cabecera del selector).
- Sin dependencias nuevas (package.json sin cambios).
