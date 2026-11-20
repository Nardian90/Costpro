# CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 — Expediente del landing (PR B)

**Identificador:** CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 (Objetivo C — P2)
**Fecha:** 2026-11-20 · **Rama:** `ux/landing-cinema-responsive-20261120` · **Base:** `main` = `bd42ad750`

---

## 1. Causa práctica confirmada

El modo cinematográfico (PR #1658) se activaba con `matchMedia('(min-width: 1024px)')`
AND `matchMedia('(min-height: 700px)')` AND sin `prefers-reduced-motion`. La decisión
ya era **reactiva** (listeners de las tres media queries), pero el **umbral de 700px
de ALTURA** excluía a los portátiles comunes al 100 % de zoom: un 1366×768 real deja
~630-670px CSS de alto tras la barra de pestañas + dirección del navegador. El
propietario recuperaba el cine cambiando el zoom (que escala el viewport CSS) —
exactamente el síntoma reportado. Archivos del motor con los mismos hashes que el
merge #1658: el defecto era de UMBRAL y de AUSENCIA DE VERIFICACIÓN DE AJUSTE, no
del motor.

Hallazgos adicionales durante la validación (matriz automatizada):

1. **Nivel 820px muerto en main**: el titular del hero tenía un nivel
   `[@media(min-width:640px)_and_(max-height:820px)]` que NUNCA se aplicaba —
   Tailwind v4 ordena las variantes arbitrarias por el texto de su media query
   ("…820px" < "…950px") y el nivel 950px ganaba la cascada en toda su banda.
   Verificado empíricamente: a 1280×720 el `<h1>` computaba 69.12px (nivel 950)
   en vez de 62.7px (nivel 820).
2. **El hero desbordaba el escenario en alturas medias** (32px a 1366×768;
   172px a 1366×620): su ritmo interno `svh` no comprime tan rápido como baja
   la altura, y el nivel 820 roto agravaba la banda 700-820.

## 2. Corrección (misión §4 — sin rediseño, sin sustituir el motor)

| Cambio | Archivo | Justificación |
| --- | --- | --- |
| Umbral de altura 700→**620px** (viewport CSS efectivo vía matchMedia) | `LandingPage.tsx` | Portátiles y ventanas medianas entran al cine; 1024×600 sigue en flujo seguro. La decisión sigue siendo reactiva (listeners) — misión §4.1. |
| **Sonda de ajuste** del escenario | `CinemaStage.tsx` | Mide el contenido EN FLUJO de cada escena (`data-scene-frame`, tolerancia 16px) al montar, tras `fonts.ready` y en resize (debounced). Si la peor escena desborda → caída al FLUJO NATIVO: nunca se fuerza el cine por encima de la legibilidad (§4.2). **Estabilizada con doble pasada**: solo reporta veredictos estables (dos mediciones consecutivas idénticas) — las micro-interacciones framer-motion (acordeón del FAQ colapsando de `height:auto` a `height:0`) producían falsos positivos transitorios de miles de px. |
| Reintento del bloqueo al crecer la ventana | `LandingPage.tsx` | `matchMedia` solo dispara al cambiar el RESULTADO de la query: un listener de resize (debounced 300ms) limpia el bloqueo por contenido cuando las queries lo permiten → la sonda re-mide (determinista por tamaño, sin oscilación). |
| **Red de seguridad del motor** | `CinemaModeBoundary.tsx` (nuevo) | ErrorBoundary: si GSAP/ScrollTrigger falla en runtime, el landing cae al flujo nativo (que NO usa GSAP) — alternativa funcional por construcción (§4.3). Sin reintentos en la sesión. |
| Perfil de altura del hero (niveles no solapados) | `HeroSection.tsx` | El hero comprime su ritmo interno en alturas medias/cortas ANTES que recortar contenido: titular, pasos verticales, visual derecho (caja aspect), tarjetas del selector. **Bandas no solapadas** `(min-height:Npx) and (max-height:Mpx)` — el orden de cascada de Tailwind entre variantes solapadas es alfabético e impredecible; con bandas disjuntas solo un nivel coincide. Mismo idioma que los niveles 1100/950 preexistentes; aplica por igual al hero de flujo. |
| Contratos actualizados | `landing-pager-contract.test.tsx`, `e2e/landing-pager.spec.ts` | Umbral 620 + sonda + boundary anclados en el contrato de fuente. |

## 3. Matriz de validación ejecutada (§4.4) — 22/22 OK

Navegador automatizado (Playwright/Chromium) contra el servidor local
(`localhost:3000`, PM2 + `.env` principal). Evidencia completa:
`matriz-responsive-landing.json` + capturas del hero a 1366×768 / 1366×620 / 1440×900.

| Viewport CSS | Resultado esperado | Resultado |
| --- | --- | --- |
| 1920×1080 | Cinematográfico | ✔ cine · 15 escenas · ids 5/5 |
| 1600×900 | Cinematográfico | ✔ cine |
| 1440×900 | Cinematográfico | ✔ cine |
| 1366×768 | Cinematográfico si el contenido cabe | ✔ cine (cabe — el caso del propietario al 100 % de zoom) |
| 1280×720 | Adaptación comprobada | ✔ cine (el contenido cabe tras el perfil de altura) |
| 1024×768 | Adaptación comprobada | ✔ cine |
| 1024×600 | Fallback o adaptación segura | ✔ flujo (600 < umbral 620) |
| 768×1024 | Tablet | ✔ flujo |
| 390×844 | Móvil | ✔ flujo |

Zoom (viewport CSS escalado sobre 1920×1080): 80 % ✔ cine · 90 % ✔ · 100 % ✔ ·
110 % ✔ · 125 % ✔ (1536×864). Sobre 1366×768: 80 % ✔ · 90 % ✔ · 100 % ✔ cine ·
110 % ✔ cine (1242×698) · 125 % → flujo (1093×614 < 620 — adaptación segura).

Además: cambio de tamaño EN VIVO durante la presentación (cine→flujo→cine, el modo
sigue al viewport sin quedar obsoleto), última escena alcanzable por scroll y recarga
directa conservando modo y 15 escenas, y `prefers-reduced-motion` → flujo nativo.
En TODOS los casos: sin overflow horizontal del documento, ids canónicos presentes,
paginador operativo — no se pierden escenas, contenido ni controles.

## 4. Riesgos y limitaciones

- La sonda mide el estado INICIAL de las escenas; la interacción del usuario
  (p. ej. abrir un acordeón del FAQ) puede desbordar visualmente la escena a
  alturas límite — comportamiento preexistente, no un corte de contenido inicial.
- El zoom se emuló escalando el viewport CSS (Playwright no tiene barra de
  navegador); en navegadores reales el zoom produce el mismo viewport CSS.
- La verificación visual por imagen no estaba disponible en la sesión del agente:
  las capturas se verificaron programáticamente (contenido renderizado, sin
  páginas en blanco) y la matriz numérica (desbordes, ids, escenas) es la
  evidencia principal. El propietario puede inspeccionar los PNG incluidos.
- E2E completo (`bunx playwright test`) no se ejecutó en esta sesión (la misión
  pedía navegador automatizado cuando esté disponible — se usó Playwright
  dirigido contra el servidor local con el mismo contrato `__cinemaSceneScrollY`).
