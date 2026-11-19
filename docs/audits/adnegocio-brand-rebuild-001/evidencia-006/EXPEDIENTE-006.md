# EXPEDIENTE-006 — ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006
## Corrección de rumbo: escenario persistente y sustitución real de escenas

**Fecha:** 2026-11-19 · **Rama:** `feat/adn-landing-true-fullpage-006-20261119` · **Base:** origin/main `9b98c01c2`

---

## 1. Estado real de partida (§3 de la misión)

| Verificación | Resultado |
|---|---|
| PR #1656 (misión 005) | **FUSIONADO** (merge `60ac9e627`; head `f75e8a2f4`) |
| PRs abiertos al iniciar | 0 (sin duplicados) |
| Producción costpro4.vercel.app | HTTP 200 (Vercel) |
| Local PM2 | restaurado con `.env` principal (health 200) |
| Rama de trabajo | nueva desde origin/main (incluye PR #1657 infra packaging) |

**Diagnóstico visual del estado 005** (`antes-005-pasillo-vacio.png`, `antes-005-hero.png`):
Playwright 1648×924 — documento de 14.756px ≈ **15.97 viewports**; `como-funciona`
8.854px ≈ **9.58vp**; en y=3000 una pantalla CASI VACÍA (solo el texto
«muestra públicamente ↓» flotando); story cards cortadas a mitad de viewport.
**Confirma la queja del propietario:** solo el hero estaba pineado; los actos
2-5 seguían siendo una página larga con pasillos de 35svh.

## 2. Arquitectura definitiva (§4)

**GSAP 3.15.1 + ScrollTrigger + ScrollToPlugin** como ÚNICO motor del escenario
(evaluación §4.1: framer-motion no ofrece snap ni labels ni `labelsDirectional`;
la alternativa inferior habría perpetuado el problema). framer-motion se
conserva para micro-interacciones internas (hero, acordeón FAQ, tabs).

```
<main>
  #cinema-stage (100svh, overflow hidden, PIN por ScrollTrigger durante toda la experiencia)
    .cinema-sweepline            ← la línea ADN que barre el escenario
    .cinema-scene × 15           ← paneles absolute inset-0, FONDO OPAQUE
  (footer — epílogo en flujo tras el escenario)
```

- **Un timeline maestro** con scrub lineal al gesto: cada transición i→i+1 es
  un segmento contiguo (la continuidad está garantizada por construcción).
- Labels `s0..s14` en los reposos + **snap `labelsDirectional` con
  `inertia: false`** — ajuste al reposo según la dirección del último gesto,
  interrumpible por cualquier nueva interacción, sin propulsión propia (§4.2).
- `end: (N-1)×100vh` con pinSpacing: tras el escenario, el footer entra como
  epílogo sin huecos.
- **Duración del timeline exactamente (N-1)** — el último label no extiende la
  duración de un timeline GSAP (causa raíz #2 del ciclo 2; relleno explícito).
- Sin wheel-hijack, sin timers, sin scroll-snap CSS (descartado con evidencia
  en 005), sin motores combinados.
- Deep-links (`#features`…) y `gotoChapter` por posición de scroll del
  ScrollTrigger (`window.__cinemaSceneScrollY` como fuente de verdad para E2E).
- `invalidateOnRefresh` + re-medición al cambiar el banner promocional.

## 3. Las 15 escenas / 5 capítulos (§5)

| Cap. | Escenas | Contenido (todo real, nada recortado) |
|---|---|---|
| 1 · Inicio | s0 | Hero con firma ADNegocio y coreografía de fragmentos del caos |
| 2 · Plataforma | s1–s9 (9 subescenas) | Apertura tipográfica + PASO 1 administra + catálogo + PASO 3 vitrina + inventario + POS + fichas de costo + reportes + seguridad/CTA — las 7 historias y los 3 pasos completos |
| 3 · Funcionalidades | s10 | Índice editorial de las 9 áreas reales (3 col. en alturas <840px) |
| 4 · Precios | s11–s12 | 3 planes + tabla comparativa (11 funciones) |
| 5 · Ayuda | s13–s14 | FAQ compacta (7 preguntas, tabs, búsqueda) + cierre «una visión completa» |

El punto 2 del navegador permanece activo durante las 9 subescenas del
capítulo 2 (sincronización por capítulo verificada en E2E).

## 4. Las 14 transiciones (§6) — cada una con identidad

| Segmento | Variante | Composición |
|---|---|---|
| s0→s1 | **sweep** | La línea ADN barre; el caos del hero se recoge (coreografía interna) y abre el capítulo |
| s1→s2 | **push** | Cinta vertical en lockstep (los bordes coinciden — jamás hay hueco) |
| s2→s3 | **depth** | El panel se aleja (scale .86) mientras el catálogo llega (scale 1.09→1) |
| s3→s4 | **mask** | Cortina clip-path de derecha a izquierda con la línea ADN en el borde |
| s4→s5 | push | El inventario empuja la vitrina |
| s5→s6 | depth | El POS surge hacia la cámara |
| s6→s7 | sweep | La línea ADN conecta con la estructura de costos |
| s7→s8 | mask | Los reportes se descubren como un informe que se abre |
| s8→s9 | push | El cierre del capítulo entra |
| s9→s10 | **typo** | Cambio de CAPÍTULO: salida tipográfica hacia la cámara (scale 1.14) + entrada escalonada de las 9 áreas |
| s10→s11 | depth | Los planes se acercan |
| s11→s12 | mask | La comparativa se despliega |
| s12→s13 | sweep | La línea ADN conduce a la ayuda |
| s13→s14 | push | El cierre final entra |

Solo `transform / opacity / clip-path` (§11). Evidencia: `trans-*.png` del
expediente y `recorrido-completo-006.webm`.

## 5. Ciclos de revisión visual y correcciones (§11)

| Ciclo | Hallazgo | Corrección |
|---|---|---|
| 1 | **Fantasmas**: capas de escenas previas visibles a través del panel activo (paneles transparentes; la cortina dejaba la saliente a alpha .5) | Paneles con FONDO OPAQUE + la cortina apaga a 0 |
| 2 | **Labels desalineados**: duración del timeline 13.75 ≠ 14 unidades → snap aterrizaba entre escenas y s14 inalcanzable; **snap con inertia predecía momentum** (se propulsaba solo) | Relleno de duración exacta (N-1) + `snap.inertia:false` |
| 3 | FAQ desbordaba por arriba (escena > 100svh) | `FAQSection compact` + marco de lectura max-w-3xl |
| 3 | Verificación numérica: drift 0.0px en las 15 reposos; dot correcto en las 5 capítulos (1-9→2, 10→3, 11-12→4, 13-14→5) | — |

**Prueba de aceptación del propietario (§11):** al hacer scroll una ESCENA
COMPLETA sustituye a otra dentro de un escenario que NO baja — el stage
permanece fijado (verificado: `top≈0` constante tras 2 flicks) y un único
panel pinta el escenario en reposo (verificado con filtro
visibilidad+opacidad+clip+geometría).

## 6. Navegación (§8)

- Los 5 puntos: saltan directo al capítulo (`gotoChapter` → posición de la
  primera escena del capítulo), `aria-current`, hilo ADN con progreso real
  (capítulo + profundidad en subescenas) y contador 01/05 + nombre.
- Teclado: 1-5, PageDown/PageUp/Home/End (sin trampas de foco; modales abiertos
  los ignoran).
- Rueda/trackpad: scroll nativo (sin hijack) — scrub + snap direccional.
- Barra nativa oculta SOLO visualmente en el landing (`scrollbar-width:none` +
  `::-webkit-scrollbar`), el desplazamiento sigue siendo nativo.
- El defecto del punto 2 (misión 004) no reaparece: los ids viven en las
  primeras escenas de cada capítulo y el E2E lo verifica en ambas ramas.

## 7. Responsive (§9) — `responsive-results.json`

| Viewport | Modo | Resultado |
|---|---|---|
| 360×740 / 390×844 / 768×1024 | **flujo nativo** | overflow-H 0 · 5 áreas alcanzables · secciones íntegras |
| 1024×768 / 1440×900 / 1648×924 / 1920×1080 | **cine** | 15 escenas · **0 desbordes** de contenido en las 15 escenas × 4 alturas |
| reduced-motion (1648×924) | **flujo nativo** | escenario NO montado · contenido visible |

Breakpoint cine: `(min-width:1024px) AND (min-height:700px) AND !reduced-motion`.

## 8. Rendimiento y accesibilidad (§10-11)

- Solo transform/opacity/clip-path en transiciones; `will-change` acotado;
  capturas con `eager` para escenas fuera de turno (sin pop-in durante la
  transición); sin listeners de scroll de alta frecuencia (el spy del cine lo
  publica `onUpdate` del ScrollTrigger; el spy por posición solo corre en flujo).
- Limpieza total al desmontar: `gsap.context().revert()`, kill de tweens de
  scroll, unregister de controles (cambio de breakpoint limpio).
- Teclado completo, `aria-current`, `aria-label` por capítulo, foco visible,
  sin trampas de foco, contraste intacto, sin audio automático.
- `prefers-reduced-motion`: recorrido funcional completo en flujo nativo.

## 9. Pruebas (§12) — ejecuciones reales de esta sesión

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | 0 errores |
| ESLint (repo completo) | 0 errores (warnings pre-existentes) |
| Vitest completo | **6202 passed** / 95 skipped (455 archivos) |
| Contrato paginador+escenario | 24/24 (actualizado para 006) |
| E2E landing (paginador + general) | **30/30 PASS** |
| Build completo | OOM en sandbox (4GB) — lo ejecuta CI como en 002-005 |
| Snap/labels | drift **0.0px** en 15 reposos (sonda numérica) |
| Escenario persistente | stage `top≈0` tras flicks; 1 escena pinta el escenario en reposo |

## 10. Contenido

- Cero contenido inventado; cero recortes: los mismos textos de las secciones
  de flujo (SECTIONS de ServicesStorySection, DEMO_CATALOG, AREAS de
  FeaturesSection, pricingPlans/comparisonRows, faqItems) alimentan las
  escenas; móvil conserva las secciones originales íntegras.
- Las pruebas de contrato verifican que el registro consume las historias
  reales y que no hay placeholders.

## 11. Archivos

- `src/components/landing/cinema/CinemaStage.tsx` — motor del escenario
- `src/components/landing/cinema/sceneRegistry.tsx` — 15 escenas / transiciones
- `src/components/landing/cinema/SceneContent.tsx` — composiciones de escena
- `src/app/LandingPage.tsx` — bifurcación cine/flujo + gotoChapter + spy
- `src/components/landing/CinematicAct.tsx` — capa de flujo (el cine 005 queda sustituido)
- `src/styles/landing-shield.css` — estilos del escenario
- `e2e/landing-pager.spec.ts` — 24 tests E2E (escenario + paginador + responsive)
- Evidencia: este directorio (58 archivos, incluido el video del recorrido).
