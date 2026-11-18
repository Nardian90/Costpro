# ADN-BRAND-HERO-REFINEMENT-002 — Validación responsive y de accesibilidad

**Fecha:** 2026-11-18 · **Herramienta:** Playwright (Chromium headless) · **Script re-ejecutable:** `/home/z/my-project/scripts/validate-hero-002.mjs` (protocolo 11d — re-verificable)

## 1. Resultado por viewport (con dev server local)

| Viewport | Overflow horizontal | h1 computado | Wordmark header | Caminos FIX-ENTRY | Resultado |
|---|---|---|---|---|---|
| 360×740 | scrollW 360 = innerW 360 (0 px) | 40px / w900 / stretch **125%** / stroke 1.5px | visible | 3/3 | **OK** |
| 390×844 | 0 px | 43.2px / w900 / 125% / 1.5px | visible | 3/3 | **OK** |
| 768×1024 | 0 px | 61.4px / w900 / 125% / 1.5px | visible | 3/3 | **OK** |
| 1024×768 | 0 px | 81.9px / w900 / 125% / 1.5px | visible | 3/3 | **OK** |
| 1440×900 | 0 px | 115.2px / w900 / 125% / 1.5px | visible | 3/3 | **OK** |
| 1920×1080 | 0 px | 134.4px / w900 / 125% / 1.5px | visible | 3/3 | **OK** |

- `font-stretch: 125%` resuelto por el navegador → el eje `wdth` de Archivo está activo (monumental expandida confirmada, no es el fallback).
- Texto accesible del h1 = «MENOS MALABARES. MÁS NEGOCIO.» (sr-only) en todos los viewports.
- **0 errores de consola** en los 6 viewports.

## 2. prefers-reduced-motion (emulación Playwright `reducedMotion: 'reduce'`)

| Verificación | Resultado |
|---|---|
| Ticker `.landing-ticker-track` con `animation: none` | **true** (estático) |
| 10 letras de «MALABARES.» con opacity=1 inmediata (sin dispersión) | **true** |
| Captura `hero-002-1440-reduced-motion.png` | composición completa y legible |

## 3. Correcciones aplicadas durante la validación

1. **Móvil 390:** «MALABARES.» se partía a mitad de palabra («MA / LABARES.») porque cada letra es un `inline-block` y la línea completa no cabía. Solución: en `<sm` cada palabra del verso 1 es su propia línea monumental (`block sm:inline` en el contenedor de letras) — 3 líneas en móvil, 2 en ≥sm. **Nunca se parte una palabra.**
2. **Banner promo móvil:** la X de cierre solapaba el texto → padding simétrico `px-9` + `truncate`.
3. **Ticker apagado:** el degradado inferior (h-44) lo cubría → altura reducida a h-24 y texto `white/42` (legible, sigue siendo sutil y decorativo `aria-hidden`).
4. **Chips**: contenedor limitado a `max-w-[400px]` para compacidad editorial.

## 4. Interacciones verificadas manualmente (Playwright)

- Hover del ticker → pausa (`animation-play-state: paused` por CSS en `.landing-ticker:hover`).
- Header scrolled (y>24) → fondo #05070A/85 + blur + borde, **mismo wordmark** (sin cambio de identidad).
- Ancla del wordmark → scroll suave al inicio (`auto` con reduced-motion).
- Cookie banner, WhatsApp FAB, progreso de lectura: sin interferencia con el hero.

## 5. Pendiente de CI

- `TypeCheck + Lint + Unit Tests + Build` (build completo en runner de CI — el sandbox local OOM en el paso TS interno de `next build`; cobertura equivalente local con `tsc --noEmit` exit 0).
- `Unit & Integration` (local: **6167/6167 PASS**).
- `E2E Aislado (project)` — el workflow es manual (workflow_dispatch) según configuración del repo; el fallo previo del PR (aserción «COSTPRO» obsoleta en `fc-template-picker.spec.ts:516`) quedó corregido en la fase A.
