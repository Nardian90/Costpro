# FASE B — FINAL REPORT

Fase: **B — Semántica Global y Navegación Transversal** · Fecha: 2026-09-22 · Baseline: `7222b62d` (post GATE 1.4P)

---

## BASELINE

HEAD == origin/main == `7222b62d`; worktree con única entrada `?? audit-evidence/GATE1.4P/`
(evidencia del gate READ-ONLY anterior, no commiteada — divergencia menor documentada en
`00-baseline.md` §2 e integrada al commit de cierre). Los 6 documentos GATE 1.4P y el Plan
Estratégico UX/IA leídos y verificados. Sin comandos destructivos.

## CHANGES (6 archivos, +337/−36)

1. **`navigation-definition.ts`** — hoja "Tablón de Noticias" (`news`) en ANÁLISIS con los
   roles históricos del tab; descripción de ANÁLISIS actualizada; `management-hub` sin
   keyword `tablón` ni mención; extensiones `ofertas` y `clientes` (patrón
   SALES_HUB_PALETTE_ENTRIES, `mobileHide`); `customers` en `pos.activeViews`; `news` fuera
   de `TECHNICAL_VIEW_IDS`.
2. **`navigation-map.ts`** — `VIEW_TO_HUB_MAP`: +`ofertas→sales-hub`, +`customers→sales-hub`,
   −`news` (fuente única: árbol); `TECHNICAL_DIRECT_ROUTES`: −`news`; rama standalone de
   breadcrumb para `bank-reconciliation`.
3. **`ManagementHubView.tsx`** — tab Tablón eliminada; tabs [Gestión Tiendas (default), Vitrina];
   valores `mgmt-hub-tab:'news'` degradan al default.
4. **`SalesHubView.tsx`** — tarjetas "Ofertas" y "Clientes" con copys honestos (patrón GATE 1.3).
5. **`CommandPalette.tsx`** — dispatch de direct-routes por `route.view` (corrige la pista
   falsa preexistente de `accounts-receivable`; habilita `clientes`).
6. **`gate1-navigation.test.ts`** — +19 contratos FASE B (5 describe); nada debilitado.

## WHY (decisiones y su evidencia — detalle en `02-decisions.md`)

- **Tablón → ANÁLISIS**: GATE 1.4P probó modelo GLOBAL/TRANSVERSAL (lector RSS sin store_id,
  contenido invariante a la tienda activa, uso orgánico 36+ req, intención histórica
  "visible para todos", ubicación previa = efecto mecánico de reducción de menú
  `b8c15082`). ANÁLISIS es la única sección global existente coherente (comparación con
  SISTEMA/INICIO/AYUDA/nueva sección documentada). Sale del hub de tiendas por mandato §4.
- **Ofertas → Ventas (tarjeta + palette + breadcrumb)**: clasificación B (stack completo,
  único déficit discovery); patrón existente del dominio (Devoluciones/Cotizaciones);
  Cotizaciones NO absorbida (GATE 1.4P descartó la sustitución).
- **Clientes → destino canónico único = CustomersView en Ventas** (mandato §6); extensión con
  id `clientes` para no pisar `IPV_ROUTES['customers']` y sin crear tercera implementación;
  el catálogo contextual de IPV permanece; la consolidación técnica queda como deuda.
- **Conciliación → fuera de la navegación principal** (mandato §7): capacidad parcial
  (esqueleto 39 LOC, importar/conciliar sin UI); promoverla aparentaría completitud;
  breadcrumb standalone honesto elimina "Módulo No Disponible" sin inventar hub; deep-link
  intacto; sin comando público en palette.

## TESTS

- Navegación: **130/130** · Suite completa: **2.200 passed / 0 failed** (24 skipped pre-existentes).
- `tsc --noEmit`: **exit 0**. ESLint (6 archivos): **0 errores** (4 warnings pre-existentes).
- `next build`: **exit 137 — kernel OOM** (limitación de entorno documentada desde GATE 1.4R;
  dmesg capturado). Compilación equivalente cubierta por tsc + suite + dev server; **CI lo
  valida** (`ci.yml`: tsc + lint + test + build 4GB) — verificado tras el push.

## BROWSER VERIFICATION

**103/103 checks PASS** en 5 viewports reales (1440/1280/1024/390/375), sesión admin real.
Los 10 puntos del mandato §15 (encontrar/abrir Tablón, regreso al hub, Ofertas, Clientes,
estado Conciliación, palette, breadcrumbs, deep-links) verificados; paridad estructural
desktop/móvil (§10) confirmada; sin scroll horizontal; 30 capturas en `screenshots/`.

## REGRESSION

Suite completa en verde + verificación explícita de Gestión de Tiendas, Dashboard, navegación
desktop/móvil, palette, breadcrumbs, permisos, active store, sesión y vistas existentes
(`06-regression.md`). Cero cambios de negocio, datos, RLS o APIs. Únicos cambios de
comportamiento visibles: los decididos (reubicación del Tablón, default del hub, tarjetas
Ofertas/Clientes, fix de dispatch de palette).

## KNOWN LIMITATIONS

1. **Build local no ejecutable en este host** (OOM del kernel, exit 137): limitación de
   entorno, no del código; equivalente cubierto (tsc/suite/dev-server) y validado por CI.
2. **Contradicción de roles del Tablón reducida, no eliminada**: la hoja conserva los roles
   históricos (deep-link universal + palette para operativos), pero la visibilidad del menú
   sigue el guard de la sección ANÁLISIS (admin/manager/encargado) — clerk/usuario/warehouse
   descubren el Tablón por palette/deep-link, no por menú. Abrir la sección ANÁLISIS a roles
   operativos es una decisión de producto mayor (afectaría Reportes/Dashboards) — hallazgo
   B-adjunto heredado de GATE 1.4P, sin cambio de permisos en este gate.
3. **Breadcrumb no visible para vistas standalone de 1 ítem** (Conciliación, como
   Calculadora/Chat — convención del shell): nada falso en pantalla, pero tampoco barra.

## UNRESOLVED ITEMS (fuera de alcance FASE B — trazados)

| Ítem | Fase sugerida |
|---|---|
| Vocabulario UX-004 ("Comparativa de Tiendas", labels de cards) y UX-006 (Vitrina nombre único), "Almacenes y Depósitos" a Almacén | Fase B restante del plan (pendiente de gate propio) |
| Breadcrumb de `storefront-config` y tabs IPV (p. ej. tab `customers` → "Módulo No Disponible" dentro de IPV) | A-resto |
| Consolidación técnica CRM (Supabase vs Dexie/IPV) y CRUD completo (editar/eliminar/detalle, campos analíticos) | Decisión de producto + fase posterior |
| UI de Conciliación (importar + conciliar + discrepancias) antes de cualquier promoción de navegación | Decisión de producto (completar vs retirar esqueleto) |
| Contradicción de roles del Tablón (§ Known Limitations 2) | Decisión de producto |
| Mis Fichas (clasificación E de GATE 1.4P) | Fase C |

## VERDICT

**CERTIFIED**

- Decisiones implementadas exactamente sobre la evidencia de GATE 1.4P y sin contradecir
  `PRODUCT-DECISIONS.md`; gate de implementación (§12) registrado ANTES de codificar.
- Navegación, breadcrumbs, palette y móvil coherentes y verificados en navegador real
  (103/103, 5 viewports); fuente única View→Hub restaurada; cero "Módulo No Disponible" en
  las capacidades afectadas; cero vistas duplicadas; Conciliación no aparenta completa.
- 2.200 tests en verde (0 fallos), TypeScript limpio, ESLint sin errores, sin regresiones de
  negocio/permisos/datos; trabajo de build cubierto y validado por CI con la limitación de
  memoria del host documentada con su exit code y causa.
- Evidencia completa en `audit-evidence/FASE-B/` (00–06 + FINAL-REPORT + 30 capturas).

La arquitectura de navegación global representa ahora fielmente las capacidades reales
demostradas por GATE 1.4P: el Tablón es transversal, Ofertas y Clientes tienen un único
destino canónico en su dominio con copys honestos, y Conciliación no simula una función
que aún no está terminada.
