# F5 — 11 VALIDATION (F5-E + F5-E.1)

Fecha: 2026-09-29 · Validación estática + regresión en vivo sobre rama `audit/f5-visual-sobriety`
(HEAD 2c7f9564 + working tree F5). Método: comandos reales + navegador (agent-browser) contra
pm2 localhost:3000, sesión admin.

## Recuperación previa (honestidad de sesión)

El workspace se detuvo durante la validación en vivo (3 fallos consecutivos de herramientas).
Recuperación sin reset/clean/descarte: `git status` intacto (16 modificados + 2 eliminados +
evidencias sin trackear), rama y HEAD correctos, `git diff --check` limpio.
Re-verificación byte-level (node fs) de los 9 fixes: **20/20 PASS**, con UNA corrección:
`WhatsAppDashboardView:276` (CTA "probar bot", alcance F5-005 del blueprint) no había sido
aplicado — se restauró con el patrón idéntico al fix hermano (`className="active:scale-95 min-h-[44px]"`,
sin override de color). La burbuja de chat `:282` (`bg-green-600`) se conserva = INTENTIONAL
(simula mensaje de WhatsApp). Verificación final: 20 PASS / 0 FAIL.

## Validación estática

| Comando | Resultado | Nota |
|---|---|---|
| `tsc --noEmit` | **0 errores** (exit 0) | |
| `eslint src --quiet` | **0 errores** (exit 0) | warnings preexistentes (1298) = deuda previa, sin delta por F5 |
| `vitest run` | **2387 passed / 24 skipped / 0 failed** (118 files pass, 1 skip) | idéntico al estado integrado PRE-F5 (mismo número exacto) → 0 regresiones atribuibles a F5 |
| `npm run build` (local) | **OOM → `Killed`** en "Creating an optimized production build" | limitación de infraestructura (box 3.9GiB; precedente REM-V2-1/2/3 y PRE-F5 ×4). NO se cambia arquitectura. **CI = autoridad del build** |
| pm2 live smoke | **HTTP 200** tras ciclo stop/start (3 verificaciones) | dev server con cambios F5 en caliente |

## Regresión en vivo — F5-E.1

### Desktop 1280×800 (10 superficies, screenshots AFTER re-capturados)

| Superficie | Deep-link | Render | Nota visual |
|---|---|---|---|
| POS / Vender | `/?view=pos` | ✓ | toolbar F4 intacta (VENTAS/CARRITO/EXPRESS/HISTORIAL), chips, grid productos |
| Ventas | `/?view=sales-hub` | ✓ | hub correcto |
| Dashboard | `/?view=dashboard` | ✓ | CTAs VISITAR `bg-primary` sólido; botón "Dashboard" tinted `bg-primary/10` + `font-medium` (F5-006 visible) |
| Inventario | `/?view=inventory` | ✓ | tabs, tabla, acciones |
| Catálogo | `/?view=catalog` | ✓ | |
| Caja | `/?view=cash` | ✓ | |
| Recepciones | `/?view=reception_list` | ✓ | breadcrumb F4 "Inicio > OPERACIÓN > LOGÍSTICA > RECEPCIONES" |
| Ajustes | `/?view=settings` | ✓ | breadcrumb "SISTEMA > AJUSTES" (F4), selector tema/modos |
| Análisis | `/?view=reports` | ✓ | superficie de análisis |
| Telegram | `/?view=telegram-hub` | ✓ | RE-CAPTURADA a 1280 (la sesión previa la dejó accidentalmente a 320px) |

Corrección de evidencia: `after-desktop-settings.png` y `after-desktop-telegram-hub.png` de la
sesión anterior estaban a 320×800 (emulación de dispositivo persistente del navegador que se
re-aplicaba en cada navegación). Ambas re-capturadas a **1280×800** y el set AFTER completo
verificado byte-level (14/14 PNG = 1280×800). Además se detectó que el screenshot relativo del
CLI resuelve contra el CWD del daemon — corregido con rutas absolutas.

### Responsive mobile (overflow horizontal programático)

`scrollWidth − innerWidth` sobre POS/Dashboard/Ajustes:

| Ancho | POS | Dashboard | Ajustes |
|---|---|---|---|
| 320 | 0px | 0px | 0px |
| 360 | 0px | 0px | 0px |
| 375 | 0px | 0px | 0px |
| 390 | 0px | 0px | 0px |
| 400 | 0px | 0px | 0px |

→ **0px overflow en 15/15 combinaciones.** Capturas `after-mobile-{320,360,375,390,400}-pos.png`.

### Temas

| Tema | Verificación | Evidencia |
|---|---|---|
| Dark (default) | `<html class="… mode-enhanced dark">`; todas las capturas desktop/mobile | set AFTER completo |
| Light | toggle header → `class="h-full mode-enhanced light"`, body `rgb(248,250,252)`; jerarquía y tokens light correctos (`--primary` light #15803d en CTAs) | `after-light-{dashboard,inventory,settings}.png` + `after-light-mobile-375-dashboard.png` |

### Invariants F1 (mobile 390, POS)

| Invariante | Resultado |
|---|---|
| MobileTabBar visible | ✓ `nav[aria-label="Navegación principal mobile"]`, h=54px, bottom=801/800 (safe-area) |
| Botones tab bar | ✓ 6 (Vender, Recibir, Inventario, Caja, Más, Colapsar) |
| Touch targets | ✓ min 48px / máx 69px (≥44 accesible, ≥36 F1) |
| Navegación usable | ✓ drawer "Más" abre grid de navegación (MÁS OPCIONES + CAMBIAR SUCURSAL) |
| Drawer cierra con Escape | ✓ `[role=dialog]` removido tras Escape (F3 heredado) |
| StickyCart | ✓ botón "Abrir carrito (0 productos)" en toolbar POS |
| SpeedDial | ✓ FAB "+" visible (drawer y POS) |
| POS toolbar | ✓ VENTAS / grid-list / CARRITO / HISTORIAL / ABRIR TURNO con aria-labels |
| Safe area | ✓ padding-bottom 0 = `env(safe-area-inset-bottom)=0` en emulador sin notch (comportamiento correcto) |
| Overflow F1 | ✓ 0px en toda la matriz (tabla superior) |

→ **F1 INTACTA.** No se reabre F1 (sin regresión demostrable).

## Regresiones cruzadas F2/F3/F4

| Fase | Check en vivo | Resultado |
|---|---|---|
| F2 | tokens/PageHeader/typography jerárquica en AJUSTES + Inventario (light y dark) | ✓ intactos; F5 no tocó tokens.css ni button.tsx ni PageHeader |
| F3 | Escape cierra drawer/overlays; AlertDialog/toaster no alterados | ✓ (F5 no tocó StateRenderer/BaseModal) |
| F4 | breadcrumbs reales en 5 vistas verificadas (POS, Recepciones, Ajustes, Telegram, Inventario); sin "Terminal de Venta"; deep-links 15/15 sin cambios de URL | ✓ intactos |
| F1 | tabla superior | ✓ intacta |

## Veredicto de validación

VALIDACIÓN COMPLETA — 0 errores estáticos, 0 fallos de test, 0 regresiones F1–F4 en vivo.
Build local no ejecutable por OOM del entorno (documentado con precedente); CI pendiente como
autoridad en la rama tras el push.
