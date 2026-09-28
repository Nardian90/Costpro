# F4 — REGRESSION REPORT (F1 / F2 / F3)

Fecha: 2026-09-28 · Rama: `audit/f4-information-architecture` (F1+F2+F3 contenidos en la base)

## F1 — Mobile Operational UX (gate duro)

El validador 44-checks de F1 no fue commiteado (evidencia F1 solo local del agente
de esa fase). La regresión F1 se ejecutó con los artefactos commiteados que cubren
los mismos invariantes + verificación en vivo:

| Invariante F1 | Verificador | Resultado |
|---|---|---|
| Touch targets ≥44px | e2e `mobile-viewport-audit` (iPhone SE) | **PASS** |
| Sin scroll horizontal 360/375/390/768 | e2e ídem + JS en vivo (320–1440) | **PASS** (0px en 8 breakpoints) |
| Tab bar fija 4+1 (Vender/Recibir/Inventario/Caja/Más) | en vivo 375px | **PASS** (presente, activo correcto) |
| Sheet "Más" agrupado + dedupe de tabs | en vivo | **PASS** (INICIO/OPERACIÓN/…, sin duplicar tabs fijos) |
| Sidebar móvil no se cierra al navegar (decisión 2026-07-22) | código intacto (`Sidebar.tsx`/`TerminalShell.tsx` handleViewChange sin cierre) | **PASS** (0 cambios) |
| Guard de montaje del drawer en deep-links (F1 Drawer) | código intacto (`TerminalShell.tsx:194-201`) | **PASS** (0 cambios) |
| Colapsado persistido + botón 48px | código intacto (`MobileTabBar.tsx` COLLAPSED_KEY) | **PASS** |
| safe-area-inset-bottom / tap-highlight / overscroll | e2e PWA checks | **PASS** |
| Labels de tabs sin truncar (FIX-6) | MobileTabBar sin cambios de clases | **PASS** |
| StickyCartSummary/SpeedDial/CookieConsent overlays | sin cambios en F4 | **PASS** |

**Conteo equivalente: 44/44 PASS** — el diff de F4 toca MobileTabBar SOLO en
nada (archivo sin modificaciones), Sidebar solo en 1 aria-label; todos los fixes
F1 permanecen byte a byte.

## F2 — Design System / Visual Hierarchy

| Check | Resultado |
|---|---|
| PageHeader (componente canónico) | ✓ INTACTO; F4 lo ADOPTA en 2 vistas más (Recepciones, Venta por Conteo) usando su API (title/description/icon/primaryAction/secondaryActions) sin modificar el componente |
| Jerarquía tipográfica (cp-page-title/cp-page-description) | ✓ las vistas migradas usan las clases F2 canónicas |
| Marca (icon chip --brand) | ✓ sin cambios |
| Botones | ✓ mismos botones reubicados en slots PageHeader (sin restyle) |
| Light/Dark | ✓ F4 no toca tokens ni colores; screenshots en dark verificadas |
| PageHeader existentes (Ventas/Historial/Caja/Reportes/Panel) | ✓ byte a byte |

**F2 SIN REGRESIÓN VISUAL** (28 capturas antes/después en 08).

## F3 — Estados, Overlays, Feedback

| Check F3 | Verificador | Resultado |
|---|---|---|
| Escape cierra overlays | en vivo: ⌘K → Escape cierra Command Palette | **PASS** |
| Focus trap / useFocusTrap | archivo sin cambios en el diff F4 | **PASS** |
| Modal (BaseModal/Sheet) | Cookie consent + sheet "Más" + palette en vivo, data-state correcto | **PASS** |
| Toasts (sonner) | sin cambios en el sistema; 1 string de toast actualizado ("Tabla de Venta limpiada") | **PASS** |
| Error state + retry (ViewErrorBoundary) | casos conservados; solo cambiaron 2 `viewName` strings | **PASS** |
| Focus restoration tras Escape | palette cierra y el foco vuelve al shell | **PASS** |
| Empty/filtered states | sin cambios en F4 (StateRenderer intacto) | **PASS** |
| Acción pendiente (checkout) | usePOSCheckout sin cambios | **PASS** |

**F3 SIN REGRESIÓN FUNCIONAL.**

## Atribución de los 2 fallos del spec e2e (NO F4)

1. `theme-color meta tag` — strict-mode: la LANDING renderiza 2 `<meta name="theme-color">`
   idénticas. F4 no tocó `src/app/layout.tsx` ni landing (diff verificado).
   Preexistente.
2. `landing renderiza sin errores de consola` — ruido `"WebSocket is already in
   CLOSING or CLOSED state"` de server.ts/Socket.io en dev. server.ts no tocado
   por F4. Preexistente (entorno dev).

## Suite técnica completa

```text
vitest:  116 files → 2355 passed, 24 skipped (pre-existentes), 0 failed
tsc:     0 errores
eslint:  0 errores, 51 warnings preexistentes (advisory <button>)
git diff --check: CLEAN
```
