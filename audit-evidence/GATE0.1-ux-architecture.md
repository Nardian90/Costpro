# GATE 0.1 — Refinamiento de Arquitectura UX (READ-ONLY)

Fecha: 2026-09-21 · Commit auditado: `e2c79d4d` · Método: lectura de código + 2 agentes de exploración (vistas home; ecosistema ayuda/auditoría/settings/desarrollo). **Ninguna modificación de código.**

Nuevas evidencias con respecto al GATE 0: `OCCView.tsx` (274 LOC), `DashboardView.tsx` (router por rol) + `MultiStoreDashboardView.tsx` (469 LOC), `ManagementHubView.tsx` + `StoresManagementView.tsx` (640 LOC) + `StoreCard.tsx`, `CostAnalyticsView.tsx` + `DynamicAnalyticsCenter` (1.560 LOC), `HelpView` (54 docs reales), `WikiView` (JSONs 1,1 MB), `AcademyView` (SRS funcional, biblioteca vacía), `LegalView` (consultor cubano, NO RGPD), `AuditGlobalView` (8 acciones etiquetadas), `SettingsView` (732 LOC, 6 secciones), `IPVView` (625 LOC + 23 tabs, IndexedDB), `Pick3IntelligenceView` (motores Markov/backtest reales), `WalletView` (1.545 LOC, Supabase + Transfermóvil).

---

## 0. RESPUESTA ÚNICA — ¿Cuál es el verdadero punto de entrada de Multi-Tienda?

**`dashboard` (DashboardView). No `occ`, no `management-hub`, no `cost-analytics`.**

| Candidato | Qué es realmente | Veredicto |
|---|---|---|
| `occ` (OCCView "Centro de Control") | Launcher personal: saludo, botón ⌘K falso, 8 quick actions (= primeras 8 de SYSTEM_ACTIONS), recientes de `localStorage`, 3 stat cards que consumen **el mismo RPC `get_dashboard_kpis`** que el dashboard | Se retira. Su contenido único (quick actions, recientes) ya lo cubre la Command Palette; sus stats ya existen en el dashboard. Hoy es casi inalcanzable: el propio `navigation-map.ts:84` redirige `occ → dashboard`, así que ni su entrada del sidebar abre OCCView |
| `dashboard` (DashboardView) | **Router por rol**: admin/manager → `MultiStoreDashboardView` (KPIs globales + tarjeta KPI por tienda con overlay `StoreDashboardView` de 3.161 LOC ECharts); clerk/encargado/warehouse/usuario → tablero de tienda única (anillo ventas/costos/ganancia, alertas de stock) | **HOME ÚNICA.** Ya gana todos los accesos de facto: Ctrl+1, ítem "Centro de Control" del sidebar (vía redirect), ⌘K "Dashboard KPI", móvil "Inicio"/"Análisis", chat IA, prefetch on hover, botones de error |
| `management-hub` (Gestión) | Superficie de control administrativo: Tablón RSS + Vitrina + CRUD completo del ciclo de vida de tiendas (con franja KPI por tienda que **duplica la del dashboard**, mismo hook `useMultiStoreDashboard`) | No es home: es administración. Su franja KPI por tienda es duplicado conocido (comentario `sidebar.structure.ts:180-184`) |
| `cost-analytics` (Tablero Principal) | Tabla dinámica tipo Power BI (drag & drop, 1.560 LOC) sobre productos/márgenes; **no es vista propia**: es tab de `cost-sheets` | Es una herramienta de ANÁLISIS, nunca un punto de entrada |

Jerarquía resuelta: **Inicio = dashboard** (ejecutivo, role-aware) ⊃ "Dashboard KPI", "Centro de Control", "Centro de Comando Operativo", "Tablero Consolidado" — todos estos nombres mueren y quedan UNO: **Inicio**. El resto de "tableros" se renombra (ver G).

## 1. ¿Qué significa "INICIO"? (decisión, no contenedor)

Evidencia: OCCView es un launcher sin contenido propio que el dashboard no tenga; su razón de ser histórica fue el FIX-DEFAULT-VIEW (2026-07-13) para que el login no aterrizara en el chat. Con la home unificada:

- **"INICIO" NO será una sección del menú.** Será un **destino fijo**: primer ítem del sidebar (fuera de secciones, icono Home), el logo, Ctrl+1 y el breadcrumb "Inicio" apuntan a `dashboard`.
- La sección ESCRITORIO desaparece. `occ` queda como **alias técnico de migración** (estado persistido en `costpro-ui-storage` de usuarios existentes) redirigiendo a `dashboard`.
- Chat con Darian: es UNA función con dos superficies ya existentes (ChatBot flotante en todas las vistas + `ChatBotView` fullscreen que lo embebe, `ChatBotView.tsx:18`). Sale del sidebar; queda el botón flotante (descubrimiento permanente) + acción ⌘K. Sin perder la vista `chat`.
- Calculadora: se queda como widget flotante + acción ⌘K (hoy es huérfana del menú; no merece primer nivel).

## 2. Clasificación obligatoria de cada entrada (§3 del PROMPT)

Frecuencia inferida de evidencias de diseño (atajos, tabs móviles, comentarios M-3/FIX), no hay telemetría. Clases: PRIMARY / HUB / SECONDARY / CONTEXTUAL / ADMIN / EXPERIMENTAL / TECHNICAL / LEGACY.

### 2.1 Sidebar actual — hojas

| Nombre actual | viewId | Qué hace realmente | Clase | Destino propuesto |
|---|---|---|---|---|
| Centro de Control | `occ` | Launcher (stats duplicadas del dashboard) | LEGACY | Muere → alias a `dashboard` (home "Inicio") |
| Chat con Darian | `chat` | Vista fullscreen del ChatBot (misma función que el flotante) | SECONDARY | Fuera de sidebar; flotante + ⌘K |
| Generar fácil | `gen-easy` | Tab de generación de `cost-sheets` (rápida/experta) | SECONDARY | Tab dentro de "Fichas de Costo" |
| Ficha de Costo | `cost-sheet-editor` | Tab editor (`main`) de `cost-sheets` | SECONDARY | Tab dentro de "Fichas de Costo" |
| Modo Asistido | `view-assisted` | Tab de `cost-sheets` | CONTEXTUAL | Tab interno |
| Informe | `view-reading` | Tab de `cost-sheets` | CONTEXTUAL | Tab interno |
| Arena FC | `arena-fc` | Tab beta de `cost-sheets` (único `isBeta` real) | EXPERIMENTAL | Tab interno (badge beta) |
| Guardar/Exportar ×2/Importar | `tool-*` | Acciones de ficha, no vistas | TECHNICAL | Acciones contextuales de la vista |
| Gestión | `management-hub` | Hub: Tablón + Vitrina + Tiendas (ciclo de vida completo + Backup/Restore por tienda) | HUB | OPERACIÓN → "Gestión de Tiendas" |
| Trabajadores y Comisiones | `workers` | CRUD trabajadores + reglas comisión versionables + pagos | HUB | OPERACIÓN (directo) |
| Tablero Principal | `cost-analytics` | Pivot BI de productos/márgenes (tab de cost-sheets) | SECONDARY | ANÁLISIS → "Tablero Dinámico" |
| Inteligencia Cambiaria | `exchange-intelligence` | Tasas oficial vs informal, impacto en precios, simulador | SECONDARY | ANÁLISIS |
| Generador de Reportes | `reports` | Reportes PDF/Excel con filtros/agrupaciones | SECONDARY | ANÁLISIS |
| Terminal | `pos` | POS con carrito, escáner, pago mixto, **modo Vale de Salida** | PRIMARY | OPERACIÓN → "Terminal de Venta" |
| Venta | `sales-hub` | Hub wayfinding: 9 tarjetas del proceso de venta | HUB | OPERACIÓN → "Venta" |
| Ofertas Comerciales | `ofertas` | CRUD promociones/descuentos/combos | SECONDARY | Tarjeta del hub Venta |
| Inventario | `inventory` | Tabs Stock / Catálogo / Trazabilidad | PRIMARY | OPERACIÓN → Almacén |
| Servicios Recibidos | `received-services` | Registro y distribución de costos de servicios | SECONDARY | OPERACIÓN → Almacén |
| Ajustes Documentales | `inventory_adjustments` | Ajustes de inventario con justificación | SECONDARY | OPERACIÓN → Almacén |
| Etiquetas y Codigos | `labels` | Generador de etiquetas barcode/QR (typo "Códigos") | SECONDARY | OPERACIÓN → Almacén |
| Recepciones | `reception_list` | Historial + crear recepción (OCR, contra OC) | PRIMARY | OPERACIÓN → Logística |
| Órdenes de Compra | `purchase-orders` | OCs a proveedores + recepción contra OC | SECONDARY | OPERACIÓN → Logística |
| Transferencia Stock | `transferencias` | Transferencias entre tiendas con tracking | SECONDARY | OPERACIÓN → Logística |
| Estructura de Costo | `estructura-costo` | Composición del costo por producto | SECONDARY | OPERACIÓN → Costo |
| Costeo Dinámico | `costeo-dinamico` | Costo real de reposición (absorción) | SECONDARY | OPERACIÓN → Costo |
| Órdenes de Producción | `production-orders` | Órdenes de producción/servicio con presupuesto y cierre | SECONDARY | OPERACIÓN → Costo |
| WhatsApp | `whatsapp-hub` | Bot por tienda, 5 tabs internos | HUB | OPERACIÓN → Redes Sociales |
| Telegram | `telegram-hub` | Bot serverless, 5 tabs internos | HUB | OPERACIÓN → Redes Sociales |
| IPV (21 hojas) | `analytics`, `reports_ipv`, `receipts`, … | 21 sidebar-ids → tabs de UNA vista con nav rail propio (23 tabs) | EXPERIMENTAL + TECHNICAL las hojas | UNA entrada `ipv`; hojas = TECHNICAL |
| Gestor de Riesgo | `pick3-intelligence` | Motores Markov/backtest/bankroll reales, scraping lotería | EXPERIMENTAL | EN DESARROLLO |
| Billetera Digital | `wallet` | Finanzas personales, importación Transfermóvil, Supabase | EXPERIMENTAL | EN DESARROLLO |
| Control Usuarios | `users` | CRUD usuarios + memberships por tienda | ADMIN | SISTEMA |
| Seguridad Roles | `roles` | Config de roles/permisos | ADMIN | SISTEMA |
| Salud Plataforma | `health` | Estado de servicios/API/BD | ADMIN | SISTEMA |
| Monitoreo de Uso | `usage-monitoring` | Forecast de consumo Vercel+Supabase | ADMIN | SISTEMA |
| Auditoría Global | `audit` | Log de acciones de usuarios (8 acciones de control: void/reset/venta-bajo-coste) + CSV | ADMIN | SISTEMA |
| Gestión RSS | `rss_management` | Config de feeds para el tablón | ADMIN | SISTEMA |
| Ajustes Globales | `settings` | Tema + conectividad + claves IA por tienda + impuestos por tienda + plan/límites (mezcla personal/tenant) | ADMIN | SISTEMA → "Ajustes" (única entrada) |
| Marco Legal | `legal` | Consultor normativa cubana + generador de formularios PDF (NO RGPD) | SECONDARY | AYUDA |
| Centro Ayuda | `help` | Centro documental Diátaxis real (54 md, búsqueda, modo lectura) | SECONDARY | AYUDA |
| Wiki Contable | `wiki` | Asientos contables + plan de cuentas cubano (JSON 1,1 MB) | SECONDARY | AYUDA |
| Academia Pro | `academy` | Flashcards SRS (mecánica real; biblioteca `docs/manuals` vacía hoy) | SECONDARY | AYUDA |

### 2.2 Contenedores (grupos/submenús) actuales

| Contenedor | Clase | Destino |
|---|---|---|
| ESCRITORIO (`core`) | LEGACY | Disuelve → "Inicio" fijo |
| COSTOS (`costos`, 9 hojas = tabs de 1 vista) | LEGACY | Disuelve → submenú "Costo" en OPERACIÓN |
| MULTI-TIENDA (`tienda`) | HUB | Se convierte en la sección OPERACIÓN (su contenido ya es el negocio) |
| Analítica / Punto de Venta / Almacén / Logística / Costo / Redes Sociales | HUB | Submenús de OPERACIÓN (Almacén/Logística/Costo/Redes) o secciones (Analítica→ANÁLISIS) |
| EN DESARROLLO (`otros`) | EXPERIMENTAL | Se conserva, admin, colapsada por defecto, al final |
| ADMINISTRACIÓN (`administracion`) | ADMIN | Se convierte en la sección SISTEMA |
| MÁS RECURSOS (`recursos`) | HUB | Se convierte en la sección AYUDA (settings se va a SISTEMA) |

### 2.3 Huérfanas y vistas sin entrada (clasificación con destino)

| viewId | Qué es | Clase | Solución |
|---|---|---|---|
| `dashboard` | Home role-aware (KPI consolidado / tienda única) | **PRIMARY** | Home "Inicio" (única) |
| `calculator` | Vista integrada del widget flotante | SECONDARY | Widget + ⌘K; sin sidebar |
| `devolutions` | Devoluciones con API propia (`/api/devolutions`) | SECONDARY | Tarjeta del hub Venta (verificar madurez en GATE 1) |
| `quotations` | Cotizaciones con API propia | SECONDARY | Tarjeta del hub Venta (verificar flujo activo) |
| `fiscal-close` | Cierre de periodo fiscal (inmutabilidad v2_19_5) | ADMIN | SISTEMA → "Cierre Fiscal" |
| `lots` | Lotes | CONTEXTUAL | Contexto de Inventario/Trazabilidad |
| `warehouses` | Maestro de almacenes/depósitos | CONTEXTUAL | Contexto de Gestión de Tiendas / Almacén |
| `abc-analysis` | Análisis ABC de productos (API propia) | SECONDARY | ANÁLISIS → "Análisis ABC" |
| `bank-reconciliation` | Conciliación bancaria global | TECHNICAL* | Pendiente dedup con IPV (que ya concilia localmente); si se mantiene → ANÁLISIS. Decisión GATE 1 |
| `accounts_receivable` | Cobros por antigüedad | CONTEXTUAL | Tarjeta del hub Venta |
| `accounts-payable` | Cuentas por pagar (dashboard, FIX-PAYMENT-TRACKING) | CONTEXTUAL | Tarjeta del hub Venta |
| `sales`, `cash`, `sales_catalog`, `inventory_count`, `history`, `catalog` | Hojas del proceso de venta / tabs de Inventario | SECONDARY/CONTEXTUAL | Tarjetas del hub Venta / tabs de Inventario (ver F) |
| `stores` | StoresManagementView standalone (case `TerminalShell.tsx:378`) | TECHNICAL | El contenido real es el tab Tiendas del management-hub; vista directa = alias |
| `news` | NewsView standalone (case :398) | TECHNICAL | Contenido real = tab Tablón del management-hub |
| `cash_report` | Monta el MISMO CashReportModal que ya vive dentro de `cash` | LEGACY | Muere (unificar en Caja) |
| `whatsapp-*` / `telegram-*` (10) | Sub-vistas globales = tabs de los hubs | TECHNICAL | Fuera de toda lista de destinos |
| `recepcion` | Creación contextual desde reception_list | CONTEXTUAL | Como está (correcto) |
| `gen-quick`, `gen-expert`, `templates` | Alias/legacy de tabs de cost-sheets | LEGACY/TECHNICAL | Compat interna, fuera de menú |
| `customers` (standalone CRM) | Colisiona con `customers` de IPV | TECHNICAL | Decidir fusión/etiqueta en GATE 1 |
| TenantConfigView | Componente sin ruta ni referencia | LEGACY | Código muerto (registro, no navegación) |

### 2.4 Páginas App Router fuera del shell

| Ruta | Clase | Solución |
|---|---|---|
| `/wiki`, `/cost-sheets`, `/system/health` | LEGACY | Redirect 307 a `/?view=wiki|cost-sheets|health` |
| `/verify-dashboard`, `/demo/calculate`, `/demo/executive` | LEGACY | Retirar (QA/mock, robots.txt ya bloquea demos) |
| `/cashier/close-session` | LEGACY | Retirar (kiosk legacy; su CTA ya da 404) |
| `/legal` (hub RGPD público) | TECHNICAL | Colisión de nombre con vista `legal`; renombrar ("Privacidad y RGPD") + arreglar 2 enlaces rotos `/knowledge/*` |
| `/pick3/combinacion/[digits]` | TECHNICAL | SEO programático; sin cambios |
| `/privacy`, `/terms`, `/tienda/[slug]`, `/`, `/fc` | — | Públicas, no navegación de app |

## 3. DECISIONES DOCUMENTADAS

### D-Auditoría (§8) — ¿análisis o control?
**SISTEMA.** `AuditGlobalView` muestra el log de `audit_logs`+`profiles` con solo **8 acciones etiquetadas, todas de control/excepción**: `invoice_without_price, sale_below_cost, transfer_created/confirmed/cancelled, store_reset_initiated/completed, reception_voided` (`AuditGlobalView.tsx:17-26`). No contiene ningún KPI de negocio. Responde "¿quién hizo X, cuándo, sobre qué registro?" con filtros y CSV → herramienta de control administrativo, admin-only. Se mantiene en SISTEMA. (`audit_ipv` es otra cosa: telemetría del motor de matching IPV desde IndexedDB — TECHNICAL, tab interna de IPV.)

### D-Ayuda (§9) — ¿una sección o un solo Centro de Ayuda?
**Sección AYUDA con 4 entradas**, porque son 3 experiencias genuinamente distintas + 1 mecánica propia, todas con contenido real (excepto la biblioteca de generación de Academia):
- `help` = centro documental **de la app** para operadores (Diátaxis, 54 md, búsqueda, glosario, modo lectura).
- `wiki` = conocimiento **contable cubano** (asientos con Debe/Haber, plan de cuentas) — contenido dominio, no documentación de la app.
- `legal` = consultor de **normativa cubana** + generador de formularios oficiales PDF (la descripción actual del sidebar que dice "RGPD, contratos" es **falsa** — eso vive en `/privacy`).
- `academy` = flashcards SRS con progreso en Supabase (mecánica real; la biblioteca está vacía porque `docs/manuals/` no existe en el repo — se documenta como limitación).
No se convierten en primer nivel global: viven agrupadas en AYUDA. El "?" del header se mantiene y se diferencia explícitamente: es **ayuda contextual de la vista actual** (39 mapeos en `HelpLauncher.tsx:24-81`), no una quinta entrada.

### D-EN DESARROLLO (§10) — ¿existe en navegación?
**Sí, como grupo admin colapsado al final.** Evidencia: las tres NO son fichas falsas — pick3 tiene motores cuantitativos reales con scraping de loterías; wallet está soportada en Supabase con importación real de backups de Transfermóvil; IPV es un banco de trabajo funcional de conciliación (aunque limitado a IndexedDB del navegador, con 1 botón falso `handleImportBackup`). Ocultarlas crearía funcionalidad sin camino de descubrimiento (violación de la regla del PROMPT). Cumplimiento de los 4 requisitos del PROMPT: estado identificado (grupo "EN DESARROLLO", icono FlaskConical), visibilidad por rol (admin-only, ya existe), jerarquía secundaria (última posición, colapsada por defecto), sin competir con productivas (IPV colapsa de 21 ítems a 1 — su nav rail interno ya es la navegación real).Nota de promoción futura: pick3/wallet son maduros; si dejan de ser experimentales, migran a una sección propia o al dominio que corresponda.

### D-Gestión de Tiendas (§11) — alcance documentado
El nombre **es correcto y se queda** (no es estética: describe exactamente el ciclo de vida completo). Alcance real de "Gestión de Tiendas" (tab de `management-hub`): crear tienda (rápida + asistente 3 pasos), editar, configurar, equipo/memberships, **Backup/Restore por tienda** (modales, admin/encargado+), reset de datos, pausar/activar, archivar/restaurar, eliminar, acciones bulk, comparar tiendas, KPIs en vivo por tienda, score de salud. El hub añade tabs Tablón Noticias (todos los roles) y Vitrina (config de storefront pública). No incluye Backup como función global: es contextual por tienda y así se queda (frecuencia baja, riesgo alto — validado en GATE 0).

### D-Costos (§12) — arquitectura única
**El grupo raíz COSTOS se disuelve.** Sus 9 entradas son tabs de la MISMA vista `cost-sheets` (`COSTOS_ROUTES`, navigation-map.ts:56-78) — eran granularidad falsa. El dominio queda en UN solo lugar, el submenú **Costo** de OPERACIÓN:
- "Fichas de Costo" (`cost-sheets`, hub con tabs internos: Generar fácil / Ficha / Asistido / Informe / Arena FC / plantillas / herramientas).
- Estructura de Costo, Costeo Dinámico, Órdenes de Producción (vistas directas reales).
- "Tablero Principal" se va a ANÁLISIS renombrado **"Tablero Dinámico"** (es una herramienta de análisis de productos, no de fabricación de fichas; elimina la competencia semántica Costo/Costos y el doble hogar del pivot).
- Roles se unifican en la matriz del submenú (hoy el grupo COSTOS admite `encargado` y el submenú Costo no — incoherencia P1-2; el usuario `costo` tiene whitelist dura `COSTO_ALLOWED_VIEWS`). Decisión GATE 1: matriz `['admin','manager','encargado','costo']` verificada contra RLS.
Resultado: existe un único concepto "Costo" (submenú) + una única herramienta "Tablero Dinámico" (ANÁLISIS). Nadie compite con nadie.

### D-Venta — Terminal vs hub (no recrear la doble puerta)
Se mantienen **dos entradas con naturalezas distintas** (una función y un contenedor — no son duplicados entre sí): "Terminal de Venta" (`pos`, PRIMARY, 1 clic — la evidencia M-3 demuestra que se creó explícitamente para no hacer al clerk pagar 2 clics diarios) y "Venta" (`sales-hub`, HUB: Tabla de Venta, Historial de Ventas, **Caja** (arqueo+cierre+reporte, UNA entrada), Venta por Conteo, Devoluciones, Cotizaciones, Cuentas por Pagar/Cobrar). "Ofertas" baja a tarjeta del hub. La tarjeta "Catálogo" del hub se elimina (el catálogo maestro vive como tab de Inventario; su descripción actual es además errónea).

## 4. Walkthrough usuario novato (§13) — 11 casos

| # | Intención | Entrada que ve | Hub | Vista |
|---|---|---|---|---|
| 1 | Quiero vender | OPERACIÓN → "Terminal de Venta" (móvil: tab Vender) | — | `pos` |
| 2 | Consultar inventario | OPERACIÓN → Almacén | Almacén | `inventory` (tab Stock) |
| 3 | Recibir mercancía | OPERACIÓN → Logística → Recepciones (móvil: tab Recibir) | Logística | `reception_list` |
| 4 | Hacer una transferencia | OPERACIÓN → Logística → Transferencia Stock | Logística | `transferencias` |
| 5 | Registrar una orden de trabajo | OPERACIÓN → Costo → "Órdenes de Producción" | Costo | `production-orders` — etiqueta final "Órdenes de Producción y Trabajo" para que la búsqueda mental "trabajo" no falle |
| 6 | Cerrar la caja | OPERACIÓN → Venta → Caja (móvil: tab Caja) | Venta | `cash` (arqueo + cierre + reporte: UN solo lugar) |
| 7 | Cómo está mi negocio | **Inicio** (primer ítem / logo / Ctrl+1) | — | `dashboard` (consolidado si admin/manager; tienda propia si no) |
| 8 | Buscar un reporte | ANÁLISIS → Reportes (o ⌘K "reporte") | ANÁLISIS | `reports` |
| 9 | Quién hizo un cambio | SISTEMA → Auditoría Global (admin; para el resto, el administrador) | SISTEMA | `audit` |
| 10 | Configurar COSTPRO | SISTEMA → Ajustes (personal: tema/conectividad; tienda: IA/impuestos; plan) · OPERACIÓN → Gestión de Tiendas (por tienda) | SISTEMA / Gestión | `settings` / `management-hub` |
| 11 | No sé cómo hacer algo | "?" del header (ayuda contextual de la vista) o AYUDA → Centro de Ayuda (54 guías con búsqueda) | AYUDA | `help` con `?doc=` de la vista actual |

Sin ambigüedades residuales: cada caso tiene exactamente una primera respuesta obvia. Caso 9 es el único con acceso restringido — correcto por diseño (control admin; la seguridad real vive en backend).

## 5. Estrategia URL (§14) — compatible con la arquitectura actual

**Problema real** (GATE 0): shell en `/`, vistas como estado Zustand persistido; back/forward/deep-link no existen; hay emisores activos a `/terminal?view=*` que dan 404 (NoStoreGuard.tsx:32, ChatBot.tsx:417, viewRegistry, subscription.service.ts:583,600).

**Solución mínima sin migrar router** — un solo hook `useViewUrlSync` montado en TerminalShell:

- Formato canónico: `/?view=<viewId>` y para vistas-módulo `/?view=ipv&tab=transactions` · `/?view=cost-sheets&tab=gen-easy` · `/?view=help&doc=...` (el patrón `?doc=` ya existe en HelpView — se generaliza).
- **pushState** en cada cambio de view (y de tab de hub) → Back/Forward del navegador funcionan entre vistas.
- **popstate** → parsear URL → `setCurrentView` (+`setIpvActiveTab`/`setActiveCostSection`). Una sola fuente de truth para hidratar.
- **Refresh**: si hay `?view=`, la URL gana sobre el estado persistido; si no, se conserva el comportamiento actual (restaurar última vista).
- **Deep link**: funciona en `/` (la sesión la maneja el shell). Compat: redirect de `/terminal?view=X` → `/?view=X` (página puñito o redirect de next.config) para enlaces heredados y los emisores vivos.
- **Emisores se migran a la URL canónica o a `setCurrentView`** (patrón ya usado por CashReportModal.tsx:1826): NoStoreGuard → `/?view=management-hub` (además arregla su 404 actual), ChatBot/viewRegistry/IA → setCurrentView, subscription.service → `/?view=pick3-intelligence`.
- La URL **no es mecanismo de seguridad**: `isViewAllowedForRole` sigue gateando en renderView y el backend/RLS sigue mandando (cumple la regla "menú ≠ seguridad").
- Granularidad de historial: cambio de vista y de tab de hub (no micro-estado como el carrito del POS — el refresh en `pos` pierde el carrito igual que hoy; documentado).
- Costo de implementación: 1 hook + ~6 emisores; cero cambios de rutas, cero reescritura de vistas.

## 6. Fuente única de verdad (§15) — plan

**Objetivo**: una definición → 5 derivaciones automáticas (Sidebar, Breadcrumb, Header title, Mobile "Más", Command Palette) + guard de roles.

```text
navigation-definition (SIDEBAR_STRUCTURE extendida)
  cada hoja gana: route { view, tab? }  ← absorbe navigation-map
  cada nodo gana: mobileCategory (derivada del grupo), description REAL
        ↓ derivación mecánica (flatten/resolve)
  Sidebar · Breadcrumb · Título del Header · Sheet "Más" móvil · Palette (vistas) · isViewAllowedForRole
        + ACTION_EXTENSIONS (acciones que no son vistas: nueva recepción, calculadora, cerrar sesión; con keywords curadas)
```

Plan GATE 1 por fases (sin big-bang):
1. **Fase 1 (corrección visible)**: purgar 13 destinos muertos (10 IDs del sheet móvil "Más", 3 `res-*` del palette), unificar labels/roles divergentes (pos/occ/cash/settings/dashboard; `reports` y `audit` difieren entre fuentes), mapear `res-help→help`, `res-system-help→help?doc=system`, `res-academy→academy`.
2. **Fase 2 (derivar)**: `useTerminalNavigation` se reconstruye aplanando la estructura (mata 10 IDs muertos y divergencias de roles **por construcción**); `SYSTEM_ACTIONS` se separa en "vistas derivadas" + "acciones explícitas".
3. **Fase 3 (cerrar)**: `navigation-map` pasa a derivarse de la definición (VIEW_TO_HUB_MAP incluido); assert en dev de que MobileTabBar solo referencia ids existentes.
Si el presupuesto no da para las 3 fases, el mínimo contractual es Fase 1 completa + Fase 2 para el sheet móvil (donde hoy están los destinos rotos que el usuario toca).

## 7. SALIDAS OBLIGATORIAS (§17)

### A. Arquitectura final propuesta

```text
INICIO (destino fijo: dashboard role-aware — NO es sección)
        ↓
SECCIÓN (Nivel 1)          HUB (Nivel 2)                 VISTA (Nivel 3)
OPERACIÓN                  Terminal de Venta             pos
                           Venta (hub)                   pos · sales_catalog · sales · cash · inventory_count · devolutions* · quotations* · CxP/CxC
                           Almacén                       inventory · received-services · inventory_adjustments · labels
                           Logística                     reception_list · purchase-orders · transferencias
                           Costo                         cost-sheets (tabs) · estructura-costo · costeo-dinamico · production-orders
                           Trabajadores y Comisiones     workers
                           Gestión de Tiendas (hub)      tabs: Tablón · Vitrina · Tiendas (+ Backup/Restore contextual por tienda)
                           Redes Sociales               whatsapp-hub · telegram-hub
ANÁLISIS                   (entradas directas)           cost-analytics "Tablero Dinámico" · exchange-intelligence · reports · abc-analysis
SISTEMA (admin)            (entradas directas)           settings · users · roles · audit · health · usage-monitoring · rss_management · fiscal-close
AYUDA                      (entradas directas)           help · wiki · academy · legal
EN DESARROLLO (admin, colapsada)                         ipv (23 tabs internas) · pick3-intelligence · wallet
```
(*) previa verificación de madurez en GATE 1. Total primer nivel visible admin: Inicio + 4 secciones + EN DESARROLLO = **6 bloques**; OPERACIÓN muestra 8 entradas (7±2). Cero secciones vacías; cero funciones falsas.

### B. Menú final tal como lo vería el usuario

```text
⌂ Inicio

OPERACIÓN
  Terminal de Venta
  Venta
  Almacén
    Inventario
    Servicios Recibidos
    Ajustes Documentales
    Etiquetas y Códigos
  Logística
    Recepciones
    Órdenes de Compra
    Transferencia Stock
  Costo
    Fichas de Costo
    Estructura de Costo
    Costeo Dinámico
    Órdenes de Producción y Trabajo
  Trabajadores y Comisiones
  Gestión de Tiendas
  Redes Sociales
    WhatsApp
    Telegram

ANÁLISIS
  Tablero Dinámico
  Inteligencia Cambiaria
  Reportes
  Análisis ABC

SISTEMA   (admin)
  Ajustes
  Control Usuarios
  Seguridad y Roles
  Auditoría Global
  Salud Plataforma
  Monitoreo de Uso
  Gestión RSS
  Cierre Fiscal

AYUDA
  Centro de Ayuda
  Wiki Contable
  Academia Pro
  Marco Legal

EN DESARROLLO   (admin, colapsada)
  IPV
  Gestor de Riesgo de Inversión
  Billetera Digital
```
Móvil (barra inferior, sin cambios de composición): **Vender · Recibir · Inventario · Caja · Más** — "Más" abre el sheet derivado de esta misma estructura.

### C. Mapa completo ruta/viewId → sección → hub → acceso

| viewId | Sección | Hub | Acceso (entrada visible) |
|---|---|---|---|
| dashboard | INICIO | — | Ítem fijo Inicio · logo · Ctrl+1 · ⌘K · breadcrumb |
| pos | OPERACIÓN | Terminal de Venta | Sidebar + tab móvil Vender + tarjeta 1 del hub Venta |
| sales-hub | OPERACIÓN | Venta | Sidebar |
| sales_catalog | OPERACIÓN | Venta | Tarjeta "Tabla de Venta" |
| sales | OPERACIÓN | Venta | Tarjeta "Historial de Ventas" |
| cash | OPERACIÓN | Venta | Tarjeta "Caja" + tab móvil Caja |
| inventory_count | OPERACIÓN | Venta | Tarjeta "Venta por Conteo" |
| devolutions / quotations | OPERACIÓN | Venta | Tarjetas (verificar GATE 1) |
| accounts-payable / accounts_receivable | OPERACIÓN | Venta | Tarjetas contextuales |
| inventory | OPERACIÓN | Almacén | Submenú (+ tab Inventario móvil) |
| received-services · inventory_adjustments · labels | OPERACIÓN | Almacén | Submenú |
| catalog | OPERACIÓN | Almacén | Tab "Catálogo" de Inventario (única puerta) |
| lots | OPERACIÓN | Almacén | Contextual (Trazabilidad) |
| reception_list | OPERACIÓN | Logística | Submenú (+ tab móvil Recibir) |
| recepcion | OPERACIÓN | Logística | CTA contextual "Nueva Recepción" |
| purchase-orders · transferencias | OPERACIÓN | Logística | Submenú |
| cost-sheets | OPERACIÓN | Costo | Submenú "Fichas de Costo" (tabs internos) |
| estructura-costo · costeo-dinamico · production-orders | OPERACIÓN | Costo | Submenú |
| workers | OPERACIÓN | — | Entrada directa |
| management-hub | OPERACIÓN | Gestión de Tiendas | Sidebar (+ sheet móvil "Más") |
| news / stores | OPERACIÓN | Gestión de Tiendas | Tabs del hub (alias técnicos) |
| warehouses | OPERACIÓN | Gestión de Tiendas | Contextual |
| whatsapp-hub · telegram-hub | OPERACIÓN | Redes Sociales | Submenú |
| cost-analytics | ANÁLISIS | — | "Tablero Dinámico" (deep-link a tab de cost-sheets) |
| exchange-intelligence · reports · abc-analysis | ANÁLISIS | — | Sidebar |
| bank-reconciliation | ANÁLISIS* | — | Pendiente dedup con IPV (GATE 1) |
| settings | SISTEMA | — | "Ajustes" (única entrada: avatar + sidebar) |
| users · roles · audit · health · usage-monitoring · rss_management · fiscal-close | SISTEMA | — | Sidebar (admin) |
| help (+ `?doc=`) | AYUDA | — | Sidebar + "?" contextual del header |
| wiki · academy · legal | AYUDA | — | Sidebar |
| ipv | EN DESARROLLO | — | Una entrada; 23 tabs con rail interno |
| pick3-intelligence · wallet | EN DESARROLLO | — | Sidebar admin |
| calculator | — | — | Widget flotante + ⌘K |
| chat | — | — | Botón flotante ChatBot (vista fullscreen se conserva) |
| cash_report · occ · gen-quick · gen-expert · customers(IPV) | — | — | Aliases técnicos/muertos (sin navegación) |

### D. Vistas huérfanas y solución
`dashboard`→home única · `abc-analysis`→ANÁLISIS · `devolutions`→hub Venta (verificar) · `quotations`→hub Venta (verificar) · `fiscal-close`→SISTEMA · `calculator`→widget+⌘K · `lots`→contextual Inventario · `warehouses`→contextual Gestión · `accounts_receivable`/`accounts-payable`→tarjetas Venta · `bank-reconciliation`→TECHNICAL hasta dedup con IPV · `stores`/`news`→tabs del hub Gestión (alias) · `/legal` público→renombrar + arreglar `/knowledge/*` rotos · `/wiki` `/cost-sheets` `/system/health`→redirect 307 · `/verify-dashboard` `/demo/*` `/cashier/close-session`→retirar.

### E. Vistas técnicas (por qué NO aparecen)
`whatsapp-*/telegram-*` (10) = tabs de sus hubs · `cash_report` = modal ya contenido en Caja · `recepcion` = creación contextual · `gen-quick/gen-expert` = alias legacy · `templates`/`tool-*` = tabs/acciones de cost-sheets · `sales`/`history`/`catalog` como tarjetas de segundo acceso se resuelven en F · `stores`/`news` = alias del hub · `customers` standalone = colisión con IPV, decidir fusión · `audit_ipv` = telemetría interna de IPV · TenantConfigView/HelpFloatingButton/RecentCostSheets/AuditLogsView = código muerto (no navegación).

### F. Duplicaciones y solución
1. **occ ↔ dashboard** → una home `dashboard`; `occ` alias de migración (P0-4 resuelto de raíz).
2. **COSTOS (grupo) ↔ Costo (submenú)** → grupo disuelto; un solo concepto "Costo"; roles unificados.
3. **cash ↔ cash_report** → muere cash_report (mismo modal dentro de Caja).
4. **catalog ×3** → tab de Inventario como única puerta; tarjeta del hub eliminada; descripción corregida.
5. **settings ×4 entradas** → una (sidebar SISTEMA + avatar mismo destino, sin segundas etiquetas en footer).
6. **Franja KPI de Gestión ↔ dashboard admin** → se conserva la del dashboard (home); la de Gestión queda como monitorio contextual del tab Tiendas (decisión GATE 1: mantener por utilidad en contexto, ya no compite como "segunda home").
7. **Dashboard KPI sin entrada ↔ 3 accesos indirectos** → es la home.
8. **"Tabla IPV" (sales_catalog) vs módulo IPV** → renombrar "Tabla de Venta" (colisión terminológica P3-2).
9. **Historial (sales) vs Movimientos (history)** → "Historial de Ventas" / "Trazabilidad (Movimientos de Stock)".
10. **? header ↔ Centro de Ayuda** → se conservan las DOS experiencias (contextual por vista vs centro documental), explícitamente diferenciadas.
11. **3 fuentes de navegación** → plan de §6 (fases 1-3).

### G. Ambigüedades resueltas
- **Inicio/Dashboard/Centro de Control/Dashboard KPI/Tablero Principal/Centro de Control**: UNA home = "Inicio" (`dashboard`). Nombres eliminados: Centro de Control, Centro de Comando Operativo, Dashboard KPI, Tablero Consolidado, Tablero Principal. El pivot sobrevive como "Tablero Dinámico" en ANÁLISIS.
- **Caja**: UNA entrada (`cash` = arqueo + cierre de turno + reporte de entrega). "Cierre de Ventas" no se crea (§16).
- **Costos/Costo**: un solo concepto (submenú Costo); el pivot es "Tablero Dinámico" en ANÁLISIS.
- **Auditoría**: SISTEMA (control), documentado en §3. `audit_ipv` queda como telemetría interna de IPV con etiqueta "Auditoría IPV" si se lista en su rail.
- **Ayuda/Wiki/Academia/Legal**: 4 entradas reales con descripciones REECRITAS según lo que hacen (la actual descripción de legal menciona RGPD — falso; settings promete "idioma/densidad" — no existe; academy promete "certificaciones" — no existe).
- **Gestión de Tiendas**: nombre correcto; alcance documentado en §3-D.
- **Trabajadores**: "Órdenes de Producción y Trabajo" elimina la duda del caso 5.
- **MULTI-TIENDA** como nombre de grupo desaparece: OPERACIÓN ya no subestima su alcance.

### H. Estrategia URL (resumen)
`/?view=X&tab=Y` · pushState+popstate en un hook único · URL gana al refresh · deep-link y compat `/terminal?view=X`→`/?view=X` · migración de 6 emisores · URL sin valor de seguridad · detalle en §5. Back/Forward/Refresh/Deep-link: los cuatro quedan definidos y testeables (se añaden a la matriz de pruebas del GATE 1).

### I. Estrategia responsive
- **Desktop expandido**: árbol completo de la §7-B; grupos colapsables; badges isNew/isBeta por fin renderizados; búsqueda del sidebar conectada al ⌘K real (hoy es decorativa).
- **Desktop colapsado (rail)**: iconos + tooltip con label Y descripción corta; indicador de activo no dependiente solo de color (barra lateral + relleno); preferencia persistida (ya existe en el store); sin pérdida de funciones (todo lo del árbol es alcanzable: rail → flyout o expandir).
- **Mobile drawer (sheet "Más")**: MISMA estructura derivada (no una tercera lista); se añade "Gestión de Tiendas" (hoy ausente en móvil); sin IDs muertos (por construcción tras Fase 2); targets ≥44px ya cumplidos en TabButton (min-h-48/min-w-44, MobileTabBar.tsx:303); drawer cierra al navegar, overlay, focus al volver, safe areas ya gestionadas por el shell.
- **Tabs móviles**: 4+1 fijos por diseño (Vender/Recibir/Inventario/Caja/Más); estado activo mapeado por grupo de proceso (Vender activo también en sales-hub/sales_catalog/devolutions — hoy `history` lo marca mal, P2-5, se corrige por derivación).
- **Topbar**: solo contexto global (tienda activa, búsqueda ⌘K, "?" contextual, notificaciones, perfil, estado de conexión) — sin convertirse en segundo menú; ChatBot flotante no entra en conflicto (HelpFloatingButton sigue desmontado).

### J. Riesgos (máx. 10)
1. **Usuarios con `currentView:'occ'` persistido** → necesita alias de migración occ→dashboard; trivial pero obligatoria (si falta, pantalla vacía).
2. **occ→dashboard toca ~7 puntos** (breadcrumb, fallbacks, Ctrl+1 label, palette, sheet móvil, group header, NoStoreGuard) — dejar uno atrás = home inconsistente.
3. **URL sync**: debe usar `window.history` directo (no next/navigation) para no re-montar la página; probar hidratación dev/prod; verificar interacción con el `?doc=` de HelpView (mismo patrón, evitar colisión de handlers).
4. **Refresh en `pos` pierde el carrito** (igual que hoy) — documentar, no "arreglar" (red line: no tocar POS).
5. **IPV colapsa 21→1**: los admins pierden accesos directos de sidebar; el rail interno lo cubre, pero enlaces persistidos a tabs IPV requieren aliases.
6. **Matriz de roles del submenú Costo** (¿encargado sí/no?) y whitelist `COSTO_ALLOWED_VIEWS` (dashboard fuera hoy) — decidir con RLS en mano; tocar mal esto corta el acceso del rol costo.
7. **Renombrados visibles** (Tablero Dinámico, Tabla de Venta, Ajustes, Órdenes de Producción y Trabajo) — viewIds NO cambian (cero impacto técnico); riesgo de confusión menor en usuarios existentes, mitigado con descripciones.
8. **devolutions/quotations/fiscal-close**: estado de madurez sin verificar — si están incompletas, darles entrada expone vistas a medio hacer; GATE 1 debe probarlas antes de publicarlas en el menú.
9. **Palette por derivación**: perder las keywords curadas degradaría la búsqueda; por eso ACTION_EXTENSIONS mantiene keywords manuales.
10. **bank-reconciliation sin dedup contra IPV** — publicar ambas crearía dos "conciliaciones"; decidir en GATE 1 con la vista abierta delante.

## 8. Cumplimiento §16 — cero funciones falsas
No se crean: Gastos (no existe), Puesto de Mando (su equivalente real es la home `dashboard`), Licencia y plan (hoy es la sección "Plan y Límites" dentro de Ajustes + upsell; si el negocio quiere vista propia, existe `/api/billing/*` para el futuro), Cierre de Ventas independiente (es `cash`), Vales de Salida independiente (modo del POS). Toda la navegación propuesta apunta a vistas/funciones existentes y verificadas en código. Limitaciones honestas registradas: Academia sin biblioteca de contenido; IPV sandbox-local con 1 botón falso; notifications de Settings no persistidas — se documentan, no se maquillan.

## 9. Veredicto

```text
NAVIGATION UX VERDICT (GATE 0.1 — propuesta, sin implementar)
[ ] READY  [X] READY WITH LIMITATIONS  [ ] NOT READY
```
READY WITH LIMITATIONS: la arquitectura es implementable sin migrar router ni tocar lógica de negocio; las limitaciones son las 10 de §7-J, de las cuales 3 bloquean el inicio de GATE 1 y necesitan decisión del propietario:
1. ¿Se aprueba home única `dashboard` con retirada de OCCView (alias incluido)?
2. ¿Matriz de roles final del dominio Costo (¿encargado dentro?) — a validar contra RLS?
3. ¿Se publican devolutions/quotations en el hub Venta tras verificación GATE 1, o quedan contextuales?

**NO IMPLEMENTADO. Esperando autorización de GATE 1.**
