# GATE 0 — Auditoría READ-ONLY de Navegación Multi-Tienda COSTPRO

Fecha: 2026-09-21 · Commit auditado: `e2c79d4d` (main) · Método: exploración de código + verificación cruzada de 3 fuentes de navegación. Ninguna modificación de código.

---

## 0. Hallazgo estructural raíz (condiciona todo)

**El shell NO vive en `/terminal?view=X`. Vive en `/` y las vistas son estado Zustand, no URL.**

- `src/app/page.tsx:30` → `HomePageClient.tsx:113-123` monta `CyberShell > TerminalShell` (con sesión) o `LandingPage` (sin sesión).
- No existe `src/app/terminal/`. No hay rewrite en `next.config.ts`.
- `currentView` vive en `costpro-ui-storage` (Zustand persist, `store/index.ts:152`); NO hay `useSearchParams`, `pushState` ni `popstate` para vistas.
- `viewRegistry.ts` documenta 31 rutas `/terminal?view=...` que **nadie parsea** y que dan **404 real**.

Consecuencias directas contra la sección 27 del PROMPT:
| Prueba requerida | Estado hoy |
|---|---|
| URL correcta por vista | ❌ la URL siempre es `/` |
| Back/Forward del navegador entre vistas | ❌ no navega vistas |
| Deep link (`/terminal?view=stores`) | ❌ 404 — y hay emisores activos: `NoStoreGuard.tsx:32` (`window.location.href`), `ChatBot.tsx:417` (`router.push`), `subscription.service.ts:583,600` (`/pick3`) |
| Refresh | ⚠️ restaura última vista por persistencia (no por URL) |

**Existen 3 fuentes de navegación paralelas y desincronizadas** (violación de la regla "NEVER hardcode sidebar ID lists elsewhere" del propio `navigation-map.ts`):
1. `SIDEBAR_STRUCTURE` (~50 entradas) — sidebar.
2. `useTerminalNavigation.ts` (56 items planos) — título del Header + MobileTabBar + sheet "Más". Contiene **10 IDs muertos** (`header`, `open-sections`, `open-annexes`, `signature`, `expert-content`, `view-kpis`, `view-expert`, `res-help`, `res-system-help`, `res-academy`) → en móvil caen al fallback "Módulo No Disponible".
3. `SYSTEM_ACTIONS` de `actions.ts` (67 acciones) — Command Palette (⌘K). Contiene 3 destinos muertos (`res-help`, `res-system-help`, `res-academy`).

Los labels también divergen entre fuentes: `pos` = "Terminal" (sidebar) vs "Vender" (móvil/palette); `occ` = "Centro de Control" vs "Inicio"; `cash` = "Arqueo de Caja" vs "Caja"; `settings` = "Ajustes Globales" vs "Configuración"; `dashboard` = sin item en sidebar vs "Análisis" en móvil. Las matrices de rol también difieren (`reports`: admin/manager en sidebar; incluye `clerk`/`warehouse` en useTerminalNavigation).

---

## A. Mapa actual (condensado)

Grupos del sidebar y sus entradas (roles entre paréntesis):

| Grupo | Entradas (primer nivel / submenús) |
|---|---|
| ESCRITORIO | Centro de Control (`occ`) · Chat con Darian (`chat`) |
| COSTOS (admin, manager, encargado, costo) | Vistas de Trabajo → gen-easy, cost-sheet-editor, view-assisted, view-reading, arena-fc (beta) · Herramientas → tool-save/export-excel/export-pdf/import |
| MULTI-TIENDA (admin, manager, encargado, clerk, usuario, warehouse) | Gestión (`management-hub`, admin/manager/encargado) · Trabajadores y Comisiones · Analítica → Tablero Principal, Inteligencia Cambiaria, Reportes · Punto de Venta → Terminal (pos), Venta (sales-hub), Ofertas · Almacén → Inventario, Servicios Recibidos, Ajustes Documentales, Etiquetas · Logística → Recepciones, Órdenes de Compra, Transferencia Stock · Costo → Estructura, Costeo Dinámico, Órdenes de Producción · Redes Sociales → WhatsApp, Telegram |
| EN DESARROLLO (admin) | IPV (5 sub-submenús, 21 items) · Gestor de Riesgo de Inversión (pick3) · Billetera Digital (wallet) |
| ADMINISTRACIÓN (admin) | Control Usuarios · Seguridad Roles · Salud Plataforma · Monitoreo de Uso · Auditoría Global · Gestión RSS |
| MÁS RECURSOS | Ajustes Globales · Marco Legal · Centro Ayuda · Wiki Contable · Academia Pro |

Hubs internos (según patrón documentado: HUB=tarjetas que cambian view global; TABS=contenido en sitio):
- `management-hub`: tabs locales Tablón Noticias / Vitrina / Gestión Tiendas (+ Dashboard KPI por tarjeta, + Backup/Restore modales por tienda en `StoreCard.tsx`).
- `sales-hub`: tarjetas → pos, sales_catalog, catalog, sales, cash, inventory_count, cash_report, accounts-payable, accounts-receivable (SalesHubView.tsx:69-167).
- `whatsapp-hub` / `telegram-hub`: 5 tabs radix cada uno (Dashboard/Config/Conversaciones/Grupo/Invitaciones).
- `inventory`: tabs Stock / Catálogo (incrusta CatalogView) / Trazabilidad (incrusta StockHistoryView).
- `ipv` (22 tabs vía `ipvActiveTab` global) y `cost-sheets` (secciones vía `activeCostSection` global).
- `GroupHubView`/`SectionHubView`: wayfinding tipo Odoo para grupos/submenús (navegables desde breadcrumb).

Entrada por teclado: ⌘K (palette), Ctrl+B sidebar, Ctrl+1/2/3 (dashboard/pos/inventory) + Ctrl+4/5 no documentados (IPV/Costos). Footer del sidebar: perfil→settings, Configuración→settings, Calculadora (widget), Salir; upsell "Plan Pro" → wa.me (plan free, no admin).

---

## B. Problemas encontrados

### P0 — bloqueadores UX
- **P0-1 · Sin URL ni historial de vistas.** Estado Zustand sin sincronización → back/forward, deep-link y compartir URLs no funcionan; los emisores a `/terminal?view=*` dan 404 (NoStoreGuard, ChatBot, viewRegistry, IA tools).
- **P0-2 · 10 IDs muertos en el sheet "Más" del móvil** (useTerminalNavigation) → usuario toca "Encabezado", "Firmas", "Ayuda de Vista", etc. y cae en "Módulo No Disponible". La ruta de descubrimiento móvil está literalmente rota.
- **P0-3 · Command Palette con 3 destinos muertos** (`res-help`, `res-system-help`, `res-academy`).
- **P0-4 · Dos "homes" inconsistentes.** `navigation-map.ts:84` mapea `occ→dashboard`: clic en "Centro de Control" abre DashboardView; `OCCView` (case válido, TerminalShell:479) queda inalcanzable tras la primera navegación; el fallback del switch apunta a `dashboard` (501) pero "Acceso Denegado" apunta a `occ` (360). Ctrl+1 dice "Dashboard/Ir al Centro de Control" (mezcla ambas).

### P1 — importantes
- **P1-1 · 3 fuentes de navegación desincronizadas** (labels, roles e IDs divergen; 13 destinos muertos en total).
- **P1-2 · Doble puerta al dominio "Costo"**: grupo raíz COSTOS (roles: +encargado, +costo) Y submenú "Costo" dentro de MULTI-TIENDA (admin/manager/costo — sin encargado). Mismo dominio, dos entradas, matrices de rol incoherentes entre sí.
- **P1-3 · Dashboard KPI huérfano del sidebar**: solo se llega por Ctrl+1, botones "Ir al Dashboard" o el botón del tab Tiendas del management-hub.
- **P1-4 · Ambigüedad "Historial"**: `sales` (Historial de Ventas) vs `history` (StockHistoryView, movimientos de stock). Breadcrumb del hub cuelga "Historial" bajo Venta y "Ventas" como hoja aparte (navigation-map.ts:286-289) — un usuario nuevo no puede predecir qué verá.
- **P1-5 · `catalog` con 3 accesos y descripción errónea**: vista standalone + tab de Inventory + tarjeta del sales-hub descrita como "Catálogo de Ventas… para enviar a clientes" cuando es CRUD maestro (viewRegistry.ts:76-80).
- **P1-6 · 8 vistas huérfanas de negocio con API propia** (ver E): devolutions, quotations, fiscal-close, lots, warehouses, abc-analysis, bank-reconciliation, customers (standalone).
- **P1-7 · Guard por rol "default-open"**: `isViewAllowedForRole` permite cualquier vista no encontrada en el sidebar (sidebar.structure.ts:461-465) — la lista de vistas protegidas es por omisión incompleta (la seguridad real está en backend/RLS, pero el guard UI no defiende).
- **P1-8 · `settings` mezcla alcance personal y tenant** (tema/idioma + API keys IA + impuestos, SettingsView.tsx:16-51) y tiene 4 entradas duplicadas (2 en footer del sidebar, 2 en avatar del header).
- **P1-9 · Rutas legacy duplicadas fuera del shell**: `/wiki`, `/cost-sheets`, `/system/health` cargan los mismos componentes que las vistas del shell; `/legal` (hub RGPD) colisiona de nombre con la vista `legal` (Consultor Legal cubano) y tiene 2 enlaces internos rotos a `/knowledge/*`.
- **P1-10 · NoStoreGuard envía a 404** en el flujo crítico "tenant sin tienda activa" (NoStoreGuard.tsx:32).

### P2 — mejoras
- P2-1 Badges `isNew`/`isBeta` definidos (ofertas, arena-fc) pero **no renderizados** en el Sidebar.
- P2-2 Hint "⌘K" del buscador del sidebar es decorativo (no abre el palette).
- P2-3 `previousView` guardado en store sin consumidor (no hay "volver" en desktop).
- P2-4 Ctrl+4/Ctrl+5 implementados pero ausentes de SHORTCUTS_REGISTRY y del modal de atajos.
- P2-5 Tab móvil "Vender" se marca activo también en `history` (StockHistoryView) — semántica incorrecta.
- P2-6 Sub-vistas whatsapp-*/telegram-* registradas 2 veces (vistas globales sin ningún link + tabs de hub).
- P2-7 Swipe horizontal cambia de TIENDA, no de vista — gesto no comunicado.
- P2-8 Wrapper `audit/AuditLogsView.tsx` sin importers (archivo muerto); `MODULE_DEFAULT_VIEW['core_tools']` apunta a un grupo que ya no existe; `MODULE_DEFAULT_VIEW` es un Record local del Sidebar (no centralizado).
- P2-9 Upsell comercial (wa.me) en el footer del sidebar convive con navegación funcional.
- P2-10 En rail/collapsed no hay badges ni búsqueda (solo tooltips); z-index sane (header 30 < sidebar 40 < palette 100 < speeddial 110).

### P3 — cosmético
- P3-1 Carpeta `cash_closure` vs id `cash`; `production-orders` duplicado en la unión de ViewType (index.ts:32-33).
- P3-2 "Etiquetas y Codigos" sin tilde; "Tabla IPV" (hoja del hub de venta) usa el acrónimo del módulo bancario IPV para una tabla de venta — colisión terminológica.
- P3-3 Comentarios de SectionHubView desactualizados respecto al contenido real de `analitica`.
- P3-4 Restos: `middleware.ts.bak`, `schemas.ts.old`, `schemas.patch.py`.

---

## C. Menú propuesto (validado contra el producto real)

Veredicto sobre el modelo mental de 4 categorías: **OPERACIÓN/ANÁLISIS/DATOS/SISTEMA es direccionalmente correcto, pero 5 de los ítems propuestos no existen en el producto** ("Puesto de Mando", "Tomar un café", "Licencia y plan" como vista, "Gastos" como vista, "Cierre de Ventas" como proceso separado de Caja), y "DATOS" quedaría vacío: Backup es una acción contextual por tienda (modal en Gestión Tiendas, StoreCard.tsx) y "Puesto de Mando" no existe — su equivalente real es el Dashboard KPI, que es ANÁLISIS. Por tanto se propone la versión corregida:

```text
INICIO
  Centro de Control            (occ — home única; absorbe occ/dashboard unificados)
  Chat con Darian              (chat)
  Calculadora                  (calculator — hoy huérfana; recuperar aquí u otros)

OPERACIÓN
  Vender
    ├── Terminal               (pos — venta rápida; aquí vive el modo "Vale de Salida")
    ├── Venta                  (sales-hub — hub: Tabla de Venta, Historial, Arqueo, Conteo)
    └── Ofertas Comerciales    (ofertas)
  Almacén
    ├── Inventario             (inventory — tabs Stock/Catálogo/Trazabilidad)
    ├── Servicios Recibidos    (received-services)
    ├── Ajustes Documentales   (inventory_adjustments)
    └── Etiquetas y Códigos    (labels)
  Logística
    ├── Recepciones            (reception_list)
    ├── Órdenes de Compra      (purchase-orders)
    └── Transferencia Stock    (transferencias)
  Trabajadores y Comisiones    (workers)
  Gestión de Tiendas           (management-hub — Tablón/Vitrina/Tiendas + Backup por tienda)
  Costo
    ├── Estructura de Costo    (estructura-costo)
    ├── Costeo Dinámico        (costeo-dinamico)
    └── Órdenes de Producción  (production-orders — "órdenes de trabajo" reales del producto)

ANÁLISIS
  Dashboard de Tiendas         (dashboard — KPIs; hoy huérfano del sidebar)
  Tablero Principal            (cost-analytics)
  Inteligencia Cambiaria       (exchange-intelligence)
  Reportes                     (reports)

SISTEMA (admin)
  Ajustes                      (settings — separar personal vs tenant)
  Control Usuarios             (users)
  Seguridad y Roles            (roles)
  Salud Plataforma             (health)
  Monitoreo de Uso             (usage-monitoring)
  Auditoría Global             (audit)
  Gestión RSS                  (rss_management)

AYUDA Y APRENDIZAJE
  Centro de Ayuda              (help — el "?" del header abre ayuda CONTEXTUAL de la vista)
  Wiki Contable                (wiki)
  Academia Pro                 (academy)
  Marco Legal                  (legal)

EN DESARROLLO (admin — explícitamente experimental)
  IPV · Gestor de Riesgo · Billetera
```

Decisiones correctoras con evidencia (no seguí la propuesta por obediencia):
1. **"Caja y Cierres" + "Cierre de Ventas" → UNA entrada "Caja" dentro de Venta/hub.** En el producto es UN proceso: `cash` renderiza CashClosureView (arqueo + cierre de turno + reporte de entrega). La pareja propuesta crearía exactamente la duda "¿cuál uso para cerrar el día?" que el PROMPT prohíbe. `/cashier/close-session` (legacy, CTA a 404) duplica este flujo → retirar.
2. **"Vales de Salida" NO en primer nivel**: es un modo del Terminal (toggle en el carrito POS, POSCart.tsx "Venta | Vale de Salida"). Subirlo a menú crearía una segunda puerta a la misma acción y fragmentaría el checkout.
3. **"Gastos" NO se crea**: no existe vista de gastos. Lo más cercano son Cuentas por Pagar/Cobrar (contextuales desde el hub de Venta). Crear el ítem sería un menú sin destino.
4. **"Puesto de Mando" → "Dashboard de Tiendas" en ANÁLISIS**: no existe ninguna vista con ese nombre; el KPI ejecutivo real es `dashboard`.
5. **"Backup" → permanece como acción contextual** (modal por tienda en Gestión Tiendas, permiso admin/encargado+). Frecuencia de uso baja, riesgo alto — correcto que no contamine Operación.
6. **"Tomar un café" / "Licencia y plan"**: no existen. Licencia hoy = botón upsell en footer del sidebar (wa.me) para plan free. Si el negocio requiere plan/pagos, existe `/api/billing/*` para construir una vista futura — no un ítem de menú sin destino.
7. **Grupo COSTOS (raíz) se absorbe**: sus 9 entradas son secciones/tabs de la MISMA vista `cost-sheets`; el submenú "Costo" en Operación ya cubre el dominio. Elimina la doble puerta P1-2 y unifica roles (hoy encargado ve COSTOS pero no el submenú Costo).
8. **Auditoría en SISTEMA (no en Análisis)**: su función real es trazabilidad administrativa de usuarios (AuditGlobalView), no análisis de negocio; es admin-only.

---

## D. Funcionalidades que NO aparecen en primer nivel (y dónde quedan)

| Funcionalidad | Ubicación propuesta | Motivo |
|---|---|---|
| Tabla de Venta (sales_catalog), Historial de Ventas (sales), Arqueo (cash), Venta por Conteo (inventory_count), cash_report | Dentro del hub **Venta** | Acceso contextual al proceso de venta; el hub ya existe |
| Nueva Recepción (recepcion) | CTA dentro de **Recepciones** | Es creación contextual, ya implementada así |
| Catálogo maestro (catalog) | Tab de **Inventario** + tarjeta en Venta | CRUD de productos sirve a ambos procesos (resolver descripción errónea) |
| Cuentas por Pagar / Cobrar | Contexto financiero del hub de Venta (hoy) | Evaluación pendiente en GATE 1: si son tareas diarias del encargado, subir a Operación |
| Tablón Noticias / Vitrina / Tiendas / Dashboard KPI por tienda / Backup-Restore | Tabs y acciones del hub **Gestión** | Ya unificados (FIX-GESTION-UNIFICADA) |
| Sub-vistas WhatsApp/Telegram (config, conversaciones, grupo, invitaciones, dashboard) | Tabs de sus hubs | Eliminar de la tabla de vistas globales o mantener como técnico |
| IPV (21 tabs), Pick3, Wallet | Grupo **EN DESARROLLO** (admin) | Explícitamente experimentales |
| Calculadora | **INICIO** o Recursos | Hoy huérfana: solo widget flotante desktop; ni sidebar, ni palette, ni móvil |
| Gestión RSS | SISTEMA (admin) | Configuración técnica de feeds |

---

## E. Vistas huérfanas (descubrimiento imposible hoy)

**Dentro del shell (renderizadas, con API propia, sin entrada en sidebar ni palette):**
| Vista | Clasificación propuesta |
|---|---|
| devolutions (Devoluciones) | A — debe tener acceso (proceso de negocio real, `/api/devolutions`) |
| quotations (Cotizaciones) | A o B — decisión GATE 1 (¿flujo activo?) |
| fiscal-close (Cierre Fiscal) | B — dentro de Análisis/Sistema según uso |
| lots (Lotes) | B — contexto de Almacén |
| warehouses (Almacenes/Depósitos) | B — contexto de Gestión/Almacén |
| abc-analysis (Análisis ABC) | B — submenú de Análisis |
| bank-reconciliation (Conciliación Bancaria) | B — Análisis o Sistema |
| customers standalone (CRM) | D — colisiona con `customers` de IPV; decidir fusión/etiqueta |
| dashboard (KPI) | A — entrada en ANÁLISIS (hoy Ctrl+1 o botón interno) |
| calculator | A (leve) — INICIO/Recursos |
| accounts_receivable | C — contextual desde Venta/Gestión |
| whatsapp-*/telegram-* (10 vistas globales) | C — solo tabs de hub (D si se elimina del switch) |

**Páginas App Router fuera del shell:**
| Ruta | Clasificación |
|---|---|
| /wiki, /cost-sheets, /system/health | E — duplicadas del shell (mismo componente); redirect o retirar |
| /verify-dashboard | E — página QA con datos mock, abandonada |
| /demo/calculate | E — demo técnica huérfana (robots.txt la bloquea) |
| /demo/executive | E — la landing usa InteractiveDemoModal, no esta ruta |
| /cashier/close-session | E — legacy kiosk; su CTA final ya da 404 (/cashier no existe) |
| /legal (hub RGPD) | A-B — huérfana + 2 enlaces internos rotos (/knowledge/* no existe) + colisión de nombre con vista legal |
| /pick3/combinacion/[digits] | C — SEO programático (solo entrada orgánica; no está en sitemap) |
| /privacy, /terms, /tienda/[slug], /, /fc | NO huérfanas (footer, vitrina, landing, FC) |

**Enlaces muertos activos (emisores de navegación a 404):** NoStoreGuard.tsx:32 (`/terminal?view=stores`), ChatBot.tsx:417 (`/terminal?view=*`), viewRegistry.ts (31 rutas documentales), cashier/close-session:136 (`/cashier`), subscription.service.ts:583,600 (`/pick3`), legal/page.tsx:60,88 (`/knowledge/*`), CommandPalette (res-*), MobileTabBar "Más" (10 IDs).

---

## F. Duplicaciones

1. **occ vs dashboard** — dos homes (P0-4).
2. **COSTOS (grupo) vs Costo (submenú MULTI-TIENDA)** — dos puertas al mismo dominio con roles incoherentes (P1-2).
3. **sales vs history** — "Historial" de ventas vs movimientos de stock, mismo término, contenidos distintos (P1-4).
4. **catalog ×3 accesos** + descripción errónea en el hub (P1-5).
5. **cash vs cash_report** — cash_report monta el MISMO CashReportModal que CashClosureView ya importa (TerminalShell.tsx:150,450); solo accesible desde el hub.
6. **settings ×4 entradas** (footer sidebar ×2 + avatar ×2, todos a la misma vista).
7. **Ayuda ×2** — "?" del header (ayuda contextual `?doc=` por vista, 41 vistas mapeadas en HelpLauncher.tsx:24-81) y "Centro Ayuda" del sidebar (misma vista sin contexto). Son dos EXPERIENCIAS distintas sobre una vista → conservar ambas pero diferenciándolas (nombrar el "?" como ayuda contextual), no fusionar.
8. **audit vs audit_ipv / reports vs reports_ipv** — dominios distintos, naming confuso (riesgo, no duplicación real).
9. **Rutas sueltas** /wiki, /cost-sheets, /system/health — duplican vistas del shell.
10. **3 fuentes de navegación** (sidebar / useTerminalNavigation / SYSTEM_ACTIONS) — la duplicación madre: labels, roles e IDs divergen.

---

## G. Confusiones de nomenclatura

- "Terminal" vs "Vender" (mismo destino, según superficie).
- "Historial" (¿de ventas o de stock?) — desambiguar: "Historial de Ventas" / "Movimientos de Stock".
- "Tabla IPV" (hoja del hub de venta) — colisiona con el módulo administrativo IPV; renombrar a "Tabla de Venta".
- "Ajustes Globales" — la vista gestiona preferencias personales + API keys + impuestos del tenant; ni "Global" ni "personal" describen el alcance.
- "Gestión Inventario"→"Almacén" ya corregido; "Almacén" (grupo) vs "Almacenes" (vista huérfana warehouses) — revisar en GATE 1.
- "Etiquetas y Codigos" — typo (Códigos).
- "MULTI-TIENDA" contiene Costo, Trabajadores, Redes — el nombre subestima su alcance real.
- "Centro de Control" vs "Dashboard" vs "Análisis" (occ/dashboard en 3 fuentes con 3 nombres).
- "Venta" (hub) vs "Ventas" (hoja) vs "Terminal" — jerarquía legible pero requiere descripciones claras.

---

## H. Rutas que deberían desaparecer de la navegación

- Vistas globales whatsapp-*/telegram-* (quedan como tabs de hub) o al menos fuera de toda lista de destinos.
- `cash_report` como vista (unificar en Caja; el modal ya existe dentro de CashClosureView).
- occ O dashboard — uno solo como home (unificación P0-4).
- 10 IDs muertos de useTerminalNavigation; 3 res-* del palette (mapear res-help→help, res-system-help→help?doc=system, res-academy→academy).
- Rutas App Router: /verify-dashboard, /demo/calculate, /demo/executive, /cashier/close-session (retirar), /wiki+/cost-sheets+/system/health (redirect 307 a `/` con view, o retirar), /legal → decidir fusión con vista legal o renombrar ("Centro Legal RGPD" vs "Consultor Legal").
- NoStoreGuard/ChatBot/viewRegistry/IA-tools: migrar a setCurrentView (patrón ya aplicado en CashReportModal.tsx:1826-1827).

## I. Rutas que deberían ser submenús / contextuales

- dashboard → entrada en ANÁLISIS (o tarjeta en Gestión) — subir de huérfano a primer nivel de Análisis.
- abc-analysis, fiscal-close, lots, warehouses, bank-reconciliation, devolutions, quotations → submenús/contexto según E.
- accounts-payable/receivable → contexto financiero (hoy) o segundo nivel de Operación si el flujo diario lo justifica.
- recepcion, sales_catalog, inventory_count → ya contextuales (correcto).
- calculator → primer nivel menor (INICIO/Recursos).

## J. Impacto por rol

| Rol | Navegación hoy | Notas |
|---|---|---|
| admin | Todo (incl. EN DESARROLLO, ADMINISTRACIÓN) | Único con IPV/Pick3/Wallet/Auditoría/RSS/Roles |
| manager | MULTI-TIENDA completo + Analítica + Costos + (health/users en useTerminalNavigation) | reports=admin/manager en sidebar pero clerk/warehouse también listados en la fuente móvil — incoherencia a unificar |
| encargado | MULTI-TIENDA + Analítica + COSTOS (grupo) pero NO submenú Costo | incoherencia P1-2 visible |
| clerk / usuario | Punto de Venta (Terminal, Venta) + tab móvil Vender; cash requiere manager+ (CashClosureView.tsx:31-41) | flujo principal móvil OK |
| warehouse | Almacén + Logística | sin Venta; sin Analítica |
| costo | REDIRECT duro a whitelist COSTO_ALLOWED_VIEWS=['cost-sheets','legal','help','wiki','academy'] (TerminalShell.tsx:276-281) | el usuario costo no ve navegación real |

Seguridad: el filtrado de menú es cosmético y heredable (allowedRoles con herencia del ancestro; si user==null muestra TODO — optimistic, useFilteredNavigation.ts:33). La seguridad real está en backend (RLS, withAuth/withRole por API) — cumple la regla del PROMPT. Riesgo UI: guard default-open para vistas no listadas (P1-7) y no hay middleware de rutas (proxy.ts solo CSP) — las páginas sueltas (/system/health, /cost-sheets, /wiki, /verify-dashboard, /demo/*) renderizan SIN sesión.

Respuesta a la pregunta central del PROMPT: **un usuario nuevo hoy sí adivina los flujos principales (vender → Terminal/mobile tabs; inventario → Almacén; recibir → Logística), pero falla en: cierre del día (dos casas: Caja en móvil/terminal vs Arqueo en hub), análisis (Dashboard KPI sin entrada visible), ayuda entre superficies, y cualquier flujo móvil a través del sheet "Más" (10 destinos rotos), además de no poder usar back/deep-link.**

---

## Qué propone GATE 1 (para aprobación; NO implementado)

1. **Sincronizar URL del shell** (`?view=` + replaceState + popstate) — requisito previo para back/forward/deep-link/refresh de la sección 27; corrección de navegación, no reescritura.
2. **Unificar a UNA fuente de navegación**: derivar useTerminalNavigation y los destinos del palette desde SIDEBAR_STRUCTURE/NAVIGATION_MAP; purgar 13 destinos muertos; unificar labels y matrices de rol.
3. **Home única** (occ→dashboard unificados, un nombre, un destino en todos los fallbacks).
4. Reestructurar sidebar a la propuesta C (INICIO/OPERACIÓN/ANÁLISIS/SISTEMA/AYUDA + EN DESARROLLO admin), absorbiendo COSTOS raíz.
5. Dar acceso a las huérfanas A/B (devolutions, dashboard, calculator…), retirar E (/verify-dashboard, /demo/*, /cashier, duplicadas).
6. Migrar emisores a setCurrentView (NoStoreGuard, ChatBot, viewRegistry/IA) y arreglar enlaces rotos (/knowledge/*, /pick3).
7. Guard default-deny para vistas desconocidas (UI-only; backend ya protege).
8. Detalles: badges isNew/isBeta, ⌘K real en el buscador, Ctrl+4/5 documentados, desambiguación Historial/Tabla IPV, typo Códigos, iconografía lucide-react existente (sin nueva librería), targets ≥44px y estados activos ya razonables (revisar en móvil).
