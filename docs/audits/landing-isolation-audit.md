# Auditoría — Blindaje Total del Landing Page (aislamiento Theme / Performance / Enhanced)

**Fecha:** 2026-10-06 · **Branch:** `fix/landing-aislamiento-total` · **Estado:** implementación en curso

## 0. Regla de oro

El Landing Page público es una **zona protegida**: ningún cambio de Theme, Modo Performance,
Modo Enhanced, preferencias visuales, localStorage o providers de la aplicación interna puede
modificar su apariencia. La app interna conserva toda su funcionalidad.

## 1. Superficie auditada

| Área | Archivos |
|---|---|
| Entrada del landing | `src/app/page.tsx` (Server Component SEO) → `src/app/HomePageClient.tsx` (split auth) → `src/app/LandingPage.tsx` (583 líneas) + `src/components/landing/*` (17 componentes) |
| Shell de la app interna | `CyberShell` + `TerminalShell` (renderizado **exclusivo**: nunca coexisten con el landing en el mismo mount) |
| Layout raíz | `src/app/layout.tsx` — `ThemeProvider` (next-themes, `attribute="class"`), script inline `localStorage('theme')`, `<body class="… bg-background text-foreground …">` |
| Manejador de modos | `src/components/IntelligentThemeHandler.tsx` — clases `mode-performance` / `mode-enhanced` + `data-connectivity` sobre `<html>`; default = **performance**; re-sync en `visibilitychange`/`focus` |
| CSS global | `src/app/globals.css` (470) → `src/styles/tokens.css` (360), `base.css` (239), `components.css` (721), `landing.css` (874), `modes.css` (1545), `elderly-tokens.css` (47) |
| Motion | `src/lib/motion-config.tsx` — framer-motion `reducedMotion="user"` (solo OS-level, no es modo de app) |

## 2. Flujo exacto de contaminación (identificado)

```text
[1] Configuración
    ├─ localStorage('theme')                        ← next-themes (toggle Light/Dark)
    ├─ localStorage('costpro-mode')                 ← Modo Performance/Enhanced
    ├─ localStorage('costpro-mode-manual-override')
    └─ localStorage('costpro-ui-storage')           ← connectivity
        ↓
[2] Estado global / aplicadores
    ├─ next-themes ThemeProvider  → <html class="dark|light">
    ├─ IntelligentThemeHandler    → <html class="mode-performance|mode-enhanced">,
    │                               <html data-connectivity="…">  (+ re-sync en focus)
    ├─ script inline de layout.tsx → <html class="dark"> si theme!=='light'
    └─ LandingPage.tsx (mount)    → ¡FUERZA <html class="dark mode-enhanced">!
        ↓
[3] Clase / atributo / variable CSS
    ├─ tokens.css  : :root{…light} / .dark{…dark}      → --background, --foreground, --primary…
    ├─ Tailwind v4 : @custom-variant dark (&:is(.dark *…)) → utilidades dark:* solo con html.dark
    ├─ globals.css : .mode-performance .tilt-card / .floating-orb-* / .card-spotlight /
    │               .border-gradient-animate / .shimmer-border / .text-reveal-up /
    │               .badge-shine / .slide-in-blur   (display:none, animation:none)
    └─ modes.css   : cientos de reglas .mode-performance*, incl. sección explícita
                    «Kill landing visual effects» (animate-*, spy-ring-anim, promo-shimmer,
                    glow-line, breathing-card, text-gradient-animate…) y re-pins de tokens
                    del landing bajo .mode-performance.dark .landing-tokens
        ↓
[4] html / body / :root
    ├─ <html class="dark mode-enhanced|mode-performance">
    ├─ <body class="bg-background text-foreground">   ← pinta el body con vars de tema
    └─ html:not(.dark) .mesh-orb { opacity:0 }        ← orbs solo en dark
        ↓
[5] LANDING PAGE (subárbol body > #root > div.landing-tokens)
    Hereda clases/atributos/variables → su diseño depende del estado global.
```

### 2.1 Vectores concretos (por qué el landing "cambia")

1. **Acoplamiento por forzado de clases (LandingPage.tsx:114–139).** Al montar, el landing
   añade `dark` + `mode-enhanced` a `<html>` y elimina `light`/`mode-performance`; al
   desmontar los restaura. Es una **carrera directa** con `IntelligentThemeHandler`, cuyo
   re-sync en `visibilitychange`/`focus` re-aplica el modo persistido: si el usuario tiene
   `costpro-mode=performance`, al volver a la pestaña el landing pierde `mode-enhanced` y
   **todas sus animaciones/efectos mueren** (reglas «Kill landing visual effects»).
2. **Dependencia de tokens de tema.** El landing consume `text-foreground` (23×),
   `text-muted-foreground` (14×), `border-border` (12×), `bg-muted` (15×), `bg-primary` (2×),
   `bg-background` (1×) + variantes `dark:` (AhaMomentSection 27×, FloatingElements 5×,
   LandingPage 1×). Con `theme=light`, esas utilidades resuelven a valores claros →
   contaminación.
3. **Selectores de atributo globales del modo Performance.** `.mode-performance
   [class*="backdrop-blur"]` (21 usos en el landing), `[class*="bg-muted/"]`,
   `[class*="animate-"]` (catch-all: mata TODAS las animaciones del landing),
   `.mode-performance canvas[class*="absolute"]`, `.mode-performance { --radius }`, etc.
4. **Glassmorphism condicionado a dark.** `.dark .form-card-glass` (globals.css:176,
   landing.css:339) y `html:not(.dark) .mesh-orb`.

### 2.2 Clases de efectos del landing realmente en riesgo

Verificación por grep: el landing usa `animate-*` de `landing.css` (gradient-shift,
scroll-logos, corner-pulse, spy-ring-anim, promo-shimmer, glow-line, breathing-card,
stat-number-glow, float-*, mesh-drift…), `backdrop-blur-*` (21×), `glass-input` (FAQ),
más los efectos listados en 2.1.3. (`tilt-card`, `card-spotlight`, `shimmer-border`,
`floating-orb-*`, `mesh-orb`, `glass-card`, `stats-glass-card` **no** se usan hoy en el
landing — quedan protegidos igualmente por la misma barrera.)

## 3. Arquitectura de aislamiento implementada

Principio: **barrera de CSS puro, sin mutación de estado global**. El landing y la app
interna son mutuamente excluyentes (`HomePageClient`), por lo que un selector de presencia
`:has(#landing-root)` separa los dos mundos sin ambigüedad.

```text
APLICACIÓN INTERNA (CyberShell/TerminalShell)      LANDING PAGE (zona protegida)
├── Theme next-themes (html.dark|light)   ✅       ├── id="landing-root" (scope propio)
├── mode-performance/enhanced (html)      ✅       ├── landing-shield.css:
├── reglas .mode-* en modes.css           ✅       │   tokens fijados --landing/-dark en
│   (ahora acotadas con                       │   html:has / body:has / #landing-root
│   :not(:has(#landing-root)))                │   color-scheme:dark, fondo #020617
├── localStorage intacto                  ✅       ├── variante dark propia:
└── Toggle Performance/Enhanced           ✅       │   dark:* SIEMPRE activo dentro de
                                                │   #landing-root (custom-variant +)
                                                └── CERO mutación de <html>/<body> por JS
```

Cambios (quirúrgicos, sin rediseño):

1. **`src/app/LandingPage.tsx`** — el div raíz recibe `id="landing-root"`; se **elimina** el
   efecto que forzaba `dark`/`mode-enhanced` en `<html>` (y su restauración). El landing ya
   no toca el estado global y deja de competir con `IntelligentThemeHandler`.
2. **`src/styles/landing-shield.css`** (nuevo, importado al final) — fijación de los tokens
   semánticos a los **valores dark actuales de `tokens.css`** (copiados verbatim → diseño
   idéntico al que el landing renderiza hoy, pues hoy siempre renderiza forzado a dark) en
   tres niveles: `html:has(#landing-root)`, `body:has(#landing-root)` y `#landing-root`;
   `color-scheme: dark`; `body:has(#landing-root){background:#020617}`; tokens `--lp-*`.
3. **`src/app/globals.css`** — `@custom-variant dark` extendido con `#landing-root *`
   (las utilidades `dark:*` del landing quedan siempre activas, sin depender de `html.dark`);
   reglas `.mode-performance` locales acotadas con `html:not(:has(#landing-root))`;
   import del escudo tras `modes.css`.
4. **`src/styles/modes.css`** — transformación mecánica de TODOS los selectores
   `.mode-performance*`/`.mode-enhanced*` a `html.mode-…:not(:has(#landing-root))…`.
   La app interna nunca coexiste con el landing ⇒ sus reglas aplican exactamente igual;
   el landing queda inmune (Theme, Performance y Enhanced incluidos).

Soporte `:has()`/`:not(:has())`: Chrome 105+, Safari 15.4+, Firefox 121+ (base de
usuarios 2026). Degradación si no hay `:has()`: el landing volvería al comportamiento
pre-blindaje (sin empeorar nada).

## 4. Verificaciones (TEST 1–8, obligatorios)

Suite Playwright: `e2e/landing-shield.spec.mjs` — matriz de escenarios
`{theme: dark|light} × {mode: performance|enhanced|default}` + reload + navegación
con regreso. Evidencia y resultados: ver `docs/audits/landing-isolation-evidence.md`.

Criterio de aceptación: los computed styles de elementos clave del landing
(fondo raíz, texto hero, glass con backdrop-blur, animaciones activas, tokens muted/border)
son **idénticos** en todos los escenarios; `<html>` ya no recibe clases del landing;
las reglas de modo se re-armam al retirar `#landing-root` (la app conserva Performance).
