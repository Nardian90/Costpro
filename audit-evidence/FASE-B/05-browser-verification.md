# FASE B — 05 BROWSER VERIFICATION (mandato §15)

Fecha: 2026-09-22 · Herramienta: Playwright (chromium headless) contra el dev server real
(PM2 `costpro`, `bun server.ts`, :3000). Script: `/home/z/my-project/scripts/faseb-browser-verify.mjs`.
Sesión: admin@demo.com (rol admin) vía `/?login=1` → login real con credenciales.
Capturas: `audit-evidence/FASE-B/screenshots/` (30 PNG: sidebar, tablón, gestión, ventas,
ofertas, clientes, conciliación, sheet móvil, dashboard — por viewport).

**RESULTADO GLOBAL: 103/103 checks PASS** — Desktop 1440: 29/29 · 1280: 29/29 · 1024: 29/29 · Móvil 390: 8/8 · 375: 8/8.

## 1. Desktop (1440 / 1280 / 1024) — checklist §15

| # | Comprobación | Resultado (idéntico en los 3 viewports) |
|---|---|---|
| 1 | Encontrar Tablón | PASS — sección ANÁLISIS del sidebar contiene "Tablón de Noticias" (focus mode: `/INICIO/ANÁLISIS → Tablón de Noticias`) |
| 2 | Abrir Tablón | PASS — clic → vista "Agregador de Noticias" renderiza; sin "Módulo No Disponible" |
| 3 | Volver al hub correcto | PASS — breadcrumb `Inicio > ANÁLISIS > Tablón de Noticias`; ancestro "ANÁLISIS" navegable |
| 4 | Encontrar Ofertas | PASS — tarjeta en hub Ventas + resultado de palette; sección ANÁLISIS muestra el Tablón |
| 5 | Abrir Ofertas | PASS — tarjeta → OfertasView renderiza; breadcrumb `Inicio > OPERACIÓN > Ventas > Ofertas` |
| 6 | Encontrar Clientes (superficie canónica) | PASS — tarjeta en hub Ventas + palette "Clientes" → CustomersView renderiza ("Nuevo Cliente"); breadcrumb `Inicio > OPERACIÓN > Ventas > Clientes` |
| 7 | Estado de Conciliación | PASS — sin menú, sin palette, sin tarjeta (no aparenta completa); deep-link muestra el esqueleto real (listado de extractos) sin hub falso ni módulo falso |
| 8 | Command palette | PASS — "Tablón"→Tablón de Noticias (Enter navega a ANÁLISIS); "Ofertas"→navega (breadcrumb Ventas); "Clientes"→navega (breadcrumb Ventas > Clientes); "conciliación"→sin comando público; "cobros"→Cobros por Antigüedad (fix de pista falsa preexistente); "caja"→1 sola acción |
| 9 | Breadcrumbs | PASS — los 4 destinos con pertenencia coherente; cero "Módulo No Disponible" |
| 10 | Deep-links | PASS — `?view=news` (`Inicio > ANÁLISIS > Tablón de Noticias`), `?view=ofertas` (Ventas > Ofertas), `?view=customers` (Ventas > Clientes), `?view=bank-reconciliation` (standalone; la barra no se renderiza con 1 ítem — convención del shell igual que Calculadora/Chat; nada falso en pantalla) |

Extras desktop: sin scroll horizontal en ninguna vista objetivo; sin scroll horizontal en Tablón.

## 2. Mobile (390 / 375) — §10 paridad estructural

| Comprobación | 390 | 375 |
|---|---|---|
| Sheet "Más" → grupo ANÁLISIS contiene "Tablón de Noticias" | PASS | PASS |
| Tap Tablón → Agregador renderiza | PASS | PASS |
| Breadcrumb `Inicio > ANÁLISIS > Tablón de Noticias` (misma semántica que desktop) | PASS | PASS |
| Sin scroll horizontal en Tablón | PASS | PASS |
| Hub Gestión: default "Gestión Tiendas", sin tab Tablón | PASS | PASS |
| Hub Ventas muestra Ofertas y Clientes | PASS | PASS |
| Tarjeta Clientes → breadcrumb Ventas > Clientes | PASS | PASS |
| Palette ⌘K encuentra Tablón de Noticias | PASS | PASS |

Sin navegación paralela móvil: el sheet "Más" es derivado de la misma definición (grupo
ANÁLISIS, mismo hub que desktop). Sin duplicación, sin elementos inaccesibles.

## 3. Notas de ejecución (transparencia)

- El script requirió iteraciones por timing del entorno dev (compilación on-demand de chunks,
  banner de cookies que intercepta pointer events, sidebar en focus-mode, `locator('main')`
  con 2 matches → strict mode). Las correcciones fueron del SCRIPT, no de la app: esperas
  explícitas (`waitForFunction` sobre `main`), aceptar cookies, `getByRole` con nombre
  accesible, `dispatchEvent('click')` para tarjetas tras `goto`.
- Dos falsos fallos intermedios de texto móvil se explicaron por una espera sobre el texto
  "Otras opciones", que también existe en la descripción del item del sidebar; se sustituyó
  por "Venta por Conteo" (título exclusivo del hub). Última ejecución: **103/103 PASS**.
