# GATE 1.4 — 09 DEEP LINKS (GATE 12) + regresión de navegación (GATE 20)

Fecha: 2026-09-21 · Método: agent-browser sobre sesión autenticada admin@demo.com, navegación directa `/?view=X`, lectura de H1 real + breadcrumb real + consola. Sin modificación de rutas.

## Matriz de deep-links probados (autenticado)

| Deep-link | Render | Título header/breadcrumb | Clasificación | Notas |
|---|---|---|---|---|
| /?view=dashboard | DashboardView (Tablero Consolidado admin) | Inicio ✓ | WORKS | HOME única |
| /?view=pos | POSView "TPV" | Inicio > OPERACIÓN > VENDER ✓ | WORKS | + alerta turno |
| /?view=cost-sheets&tab=gen-easy | GENERAR FÁCIL | Inicio > OPERACIÓN > Costo > FICHAS DE COSTO ✓ | WORKS | — |
| /?view=cost-sheets&tab=view-assisted | **Modo Asistido** ✓ | (tab técnica) | WORKS (contenido) | palette-invisible |
| /?view=cost-sheets&tab=view-reading | **Informe de Costo** ✓ | (tab técnica) | WORKS (contenido) | palette-invisible |
| /?view=cost-sheets&tab=arena-fc | ArenaFC ✓ (vacío sin fichas) | (tab técnica) | WORKS (contenido) | palette-invisible |
| /?view=cost-sheets&tab=templates | Explorador de Plantillas ✓ | (tab técnica) | WORKS (contenido) | palette-invisible |
| /?view=sales | Historial de Ventas | Inicio > OPERACIÓN > Ventas > Historial ✓ | WORKS | — |
| /?view=sales-hub | SalesHub (hero+cards) | ✓ | WORKS | GATE 1.3 intacto |
| /?view=news | Tablón de Noticias | Inicio > OPERACIÓN > Gestión de Tiendas > Tablón ✓ | WORKS | — |
| /?view=stores | Tiendas | … > Gestión de Tiendas > Tiendas ✓ | WORKS | — |
| /?view=lots | Lotes | … > Almacén > Inventario > Lotes ✓ | WORKS | — |
| /?view=warehouses | Almacenes y Depósitos | … > Gestión de Tiendas > Almacenes y Depósitos | WORKS (contenido) | **dominio dudoso (MISPLACED)** |
| /?view=storefront-config | StorefrontConfigView ✓ (H1 "Vitrina Pública") | **"STOREFRONT CONFIG > MÓDULO NO DISPONIBLE"** | **BROKEN-UX (UX-002)** | la vista SÍ carga; título/breadcrumb mienten |
| /?view=customers | CustomersView ✓ (H1 "Clientes") | **"customers > MÓDULO NO DISPONIBLE"** | **BROKEN-UX (UX-002)** | ídem |
| /?view=bank-reconciliation | BankReconciliationView ✓ | **"bank reconciliation > MÓDULO NO DISPONIBLE"** | **BROKEN-UX (UX-002)** | ídem |
| /?view=ofertas | OfertasView (sin H1) | **"OFERTAS > MÓDULO NO DISPONIBLE"** | **BROKEN-UX + ORPHAN** | ídem + sin contenido claro |
| /?view=cash_report | Reporte de Caja — Entrega ✓ | Inicio > … > Ventas > Reporte de Entrega ✓ | WORKS | modal-elevado correcto |
| /?view=calculator | Calculadora | Calculadora ✓ (caso especial en breadcrumb fn) | WORKS | — |
| /?view=chat | ChatBotView | Chat con Darian ✓ (caso especial) | WORKS | — |

## Root cause de UX-002 (defecto de HEADER/BREADCRUMB, no de rutas)

`getBreadcrumbForView` (navigation-map.ts:368-373): si la vista no está en el árbol de la definición NI en VIEW_TO_HUB_MAP → `[{label: viewId normalizado}, {label:'Módulo No Disponible', isCurrent:true}]`. El Header compone su H1 del breadcrumb → **toda vista técnica fuera de ambos mapas se anuncia como "Módulo No Disponible" aunque el componente renderice perfectamente**. Afecta hoy a: storefront-config, customers, bank-reconciliation, ofertas (+ cualquier futura vista técnica sin registro). El mensaje es además falso (la vista SÍ está disponible) y el usuario pierde la noción de dónde está — contradice el propósito del propio E-Fix (dar contexto).

## Sesión no autenticada

- Con cookies limpias, `/?view=pos` NO redirige a login: el shell queda con estado de cliente envejecido (captura unauth-view-pos.png muestra sidebar "Admin Demo" tras limpiar cookies — la sesión real caducará al primer fetch). Riesgo menor de estado zombie (UX-014, P3): falta redirección a `/?login=1` o purga del store al 401 global.

## Back/Forward y refresh

- pushState por vista/tab activo (useViewUrlSync: pushState en cada cambio de vista y tab de hub/módulo) → back/forward preservan vista (verificado indirectamente por URL estable en todas las navegaciones del gate; refresh reconstruye desde URL con normalizeLegacyView + sanitizeViewId).

## GATE 20 — Regresión de la reorganización (git 86d99d54 vs f614ba75/1b894fa1)

- `86d99d54` tocó: ServiceWorkerRegister (SW root-cause), SalesHubView (jerarquía §16), view-tips (1 tip), modes.css (perf bg), next.config.ts (allowedDevOrigins). **No tocó** navigation-definition.ts, navigation-map.ts, MobileTabBar, TerminalShell → **la reorganización de GATE 1.3/R.1 no alteró destinos, deep-links, palette ni permisos de navegación** (los deep-links rotos/ocultos pre-existían a este commit — son deuda de la arquitectura previa GATE 1/1.1/1.2, no regresión de 86d99d54).
- Los aliases legacy (occ→dashboard, costos→gen-easy, ipv_*→ipv, etc.) siguen normalizando (código verificado); bookmarks antiguos OK.
