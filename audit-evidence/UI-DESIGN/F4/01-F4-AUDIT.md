# F4-A — AUDITORÍA READ-ONLY · Information Architecture

Fecha: 2026-09-28 · Rama: `audit/f4-information-architecture` @ `60dd04ac`
Método: reconstrucción de la IA REAL (código + derivadores + verificación de cada destino), 2 barridos paralelos (nomenclatura/títulos, huérfanas/dead-nav) + lectura directa de fuentes. **No se modificó ningún archivo.**

---

## 1. SOURCE OF TRUTH — VERIFICADO

**`src/config/navigation/navigation-definition.ts` (1267 líneas) es la fuente única real**, establecida por el GATE 1 previo y CONSISTENTE hoy:

| Superficie | Derivación | Verificación |
|---|---|---|
| Sidebar | `sidebar.structure.ts:44` → `NAVIGATION_SECTIONS.map(toNavModule)` | ✓ sin árbol propio |
| Guard de roles | `sidebar.structure.ts:70` `isViewAllowedForRole` sobre el árbol derivado | ✓ |
| Breadcrumb | `navigation-map.ts:304` `getBreadcrumbForView` desde la definición + `VIEW_TO_HUB_MAP` | ✓ |
| Command Palette | `actions.ts:45-78` `SYSTEM_ACTIONS` = `HOME_ITEM`+`flattenNavigation()`+`ACTION_EXTENSIONS`; `CommandPalette.tsx:54-56` la consume | ✓ |
| Header (título) | `useTerminalNavigation.ts:57-71` (HOME + flatten) + fallback al último crumb (`Header.tsx:74-76`) | ✓ |
| MobileTabBar | `MOBILE_MAIN_TABS` + sheet derivado de `NAVIGATION_SECTIONS`/`ACTION_EXTENSIONS` (`MobileTabBar.tsx:83-120`) | ✓ |
| Deep-links | `useViewUrlSync.ts` → `/?view=X&tab=Y`, normalización vía `normalizeLegacyView` | ✓ |
| Integridad | `assertNavigationIntegrity()` en dev (`TerminalShell.tsx:259-261`) — 0 destinos muertos en menú/palette | ✓ |

**Listas paralelas prohibidas (OLD_SIDEBAR/NAV_ITEMS/MENU_ITEMS): 0 existencias.**
Listas locales menores (todas con destinos válidos): `MobileTabBar.costTabs` (:127-133, 5 tabs del módulo Costo — curada, por diseño análogo al rail de IPV), `Sidebar.MODULE_DEFAULT_VIEW` (:138-144), `HelpLauncher.HELP_DOC_BY_VIEW` (:24), `users/RoleForm.tsx:29-37` `AVAILABLE_VIEWS` (**stale, labels en inglés, sin relación con ViewTypes — ver §8**).

**Contrato ViewId (GATE 1.1)**: saneamiento en store (persist), breadcrumb y shell — activo y verificado en `store/index.ts:170-230`.

---

## 2. MAPA REAL DE NAVEGACIÓN (reconstruido)

```text
COSTPRO (SPA: TerminalShell, deep-link /?view=X&tab=Y, alias legacy normalizados)
├── INICIO (fijo, fuera de secciones)
│   └── Inicio → view 'dashboard'  [role-aware]
│       admin/manager → MultiStoreDashboardView (h2 "Tablero Consolidado")
│       clerk/otros   → DashboardView (PageHeader "Panel de Control")
│
├── OPERACIÓN [admin,manager,encargado,clerk,usuario,warehouse]
│   ├── Vender (pos) ──────────── primary · POSView · h2 interno "TPV" ⚠F-05
│   ├── Ventas (sales-hub) ────── hub · SalesHubView · PageHeader "Ventas"
│   │     └─ tarjetas PRIMARY: Vender(pos) · Caja(cash) · Historial de Ventas(sales)
│   │        tarjetas SECONDARY: Tabla de Venta(sales_catalog) · Venta por Conteo
│   │        (inventory_count) · Devoluciones · Cotizaciones · Ofertas · Clientes
│   │        (clientes→customers) · Cuentas por Pagar · Cobros por Antigüedad
│   ├── Almacén (submenu)
│   │     ├── Inventario (inventory) ── primary · tabs internas Stock/Catálogo/Trazabilidad (sin título) ⚠F-08
│   │     ├── Servicios Recibidos (received-services)
│   │     ├── Ajustes Documentales (inventory_adjustments)
│   │     └── Etiquetas y Códigos (labels)
│   ├── Logística (submenu)
│   │     ├── Recepciones (reception_list) · h2 "Recepciones" ⚠F-06
│   │     ├── Órdenes de Compra (purchase-orders)
│   │     └── Transferencia Stock (transferencias)
│   ├── Costo (submenu) [admin,manager,encargado,costo]
│   │     ├── Fichas de Costo (cost-sheets, tab 'main'=Experto) · rail propio 5 tabs ⚠F-09
│   │     ├── Estructura de Costo (estructura-costo)
│   │     ├── Costeo Dinámico (costeo-dinamico)
│   │     └── Órdenes de Producción y Trabajo (production-orders)
│   ├── Trabajadores y Comisiones (workers)
│   ├── Gestión de Tiendas (management-hub) ── hub · h2 "Gestión" + breadcrumb local duplicado ⚠F-04
│   └── Redes (submenu)
│         ├── WhatsApp (whatsapp-hub) ── tabs internas: dashboard/config/conversations/group/invitations
│         └── Telegram (telegram-hub) ── ídem
│
├── ANÁLISIS [admin,manager,encargado]
│   ├── Dashboard de Tiendas (dashboard) ── ⚠F-01 MISMA vista que Inicio
│   ├── Análisis de Fichas (cost-analytics → cost-sheets + tab)
│   ├── Inteligencia Cambiaria (exchange-intelligence)
│   ├── Tablón de Noticias (news)
│   ├── Reportes (reports) ── PageHeader "Reportes" ✓
│   └── Análisis ABC (abc-analysis)
│
├── SISTEMA [admin]
│   ├── Ajustes (settings) · h2 interno "Ajustes Globales" ⚠F-03
│   ├── Usuarios (users) · Roles (roles) · Salud (health) · Monitoreo (usage-monitoring)
│   ├── Auditoría (audit) · Gestión RSS (rss_management) · Cierre Fiscal (fiscal-close)
│
├── AYUDA: Centro de Ayuda (help) · Wiki (wiki) · Academia (academy) · Marco Legal (legal)
│
├── EN DESARROLLO [admin, experimental]: IPV (ipv, rail 23 tabs) · Pick3 · Billetera (wallet)
│
├── PALETTE/ACCIÓN (ACTION_EXTENSIONS, sin sidebar): Nueva Recepción (recepcion) ⚠F-07,
│   Calculadora, Chat con Darian (chat), Vitrina Pública (storefront-config) ⚠F-10
│
└── MÓVIL (MobileTabBar): tabs fijos Vender · Recibir · Inventario · Caja + "Más"
    (sheet agrupado por sección; dedupe de tabs por construcción; ACCIONES = ext. sin mobileHide)
```

**Total**: 5 secciones + INICIO · 38 hojas de menú · 25 extensiones de acción/palette · 46 IDs técnicos · 22 alias legacy · 95 ViewTypes.

---

## 3. AUDITORÍA DE DUPLICACIÓN

### 3.1 Dashboard (mandato task book) — F-01

| Evidencia | Detalle |
|---|---|
| `navigation-definition.ts:90-97` | `HOME_ITEM` "Inicio" → id `dashboard` |
| `navigation-definition.ts:341-351` | ANÁLISIS hoja "Dashboard de Tiendas" → **mismo id `dashboard`** (sin `route` propia) |
| Render | Ambos muestran LA MISMA vista (MultiStoreDashboardView admin / DashboardView clerk) |
| Resaltado | `isSidebarItemActive('dashboard',…)` = `currentView==='dashboard'` → **"Inicio" y "Dashboard de Tiendas" aparecen activos SIMULTÁNEAMENTE** en el sidebar |
| Emisores extra | logo (`Sidebar.tsx:504,514`), `MODULE_DEFAULT_VIEW['analisis']` → dashboard |

**Veredicto**: NO son conceptos distintos — un destino, dos entradas de menú + doble resaltado. Históricamente deliberado (comentario "Aprobado §1/§baseline"), pero hoy la única diferencia es el *label*. → **Clasificar como candidato de consolidación (D). NO eliminar en F4** (regla de no-sorpresa; decisión de producto).

### 3.2 Ventas (mandato: estructura certificada preservada) — ✓ CONFORME

La estructura certificada está intacta: `OPERACIÓN → Vender` (primary, verbo) + hub `Ventas` con sus hojas. **No existe reintroducción de "Terminal de Venta"/"TPV" como label de navegación** — el único residuo "TPV" es el h2 interno de POSView (F-05) y residuos textuales (F-12). La palabra "Caja" se reutiliza erróneamente como label del botón carrito en POS desktop (`POSView.tsx:426`) — colisión semántica con la vista Caja (F-13).

### 3.3 Ficha de Costo (mandato: no es el héroe) — ✓ CONFORME

`Costo` es un submenú de OPERACIÓN (4 hojas); `Análisis de Fichas` cuelga de ANÁLISIS vía route con tab. Nada la eleva a eje principal. El splash interno con nombre retirado "Tablero Principal" (`CostSheetView.tsx:492`) se corrige (F-09).

### 3.4 Otras duplicaciones de entrada

| Destino | Superficies | Clase |
|---|---|---|
| `cash` Caja | tab móvil + tarjeta hub + palette (mobileHide) | patrón hub intencional ✓ |
| `sales`, `inventory_count`, `devolutions`, `quotations`, `ofertas`, `clientes` | tarjeta hub + palette | patrón hub intencional ✓ |
| `pos` Vender | menú + tarjeta hub + tab móvil | patrón intencional ✓ |
| `inventory` | submenú Almacén + tab móvil (dedupe en sheet ✓) | ✓ |
| `settings` | **"Mi Perfil" y "Configuración" del menú usuario AMBOS → settings** (`Header.tsx:292,299`) | D-candidato (no eliminar; documentar) |
| `accounts_payable` | dos ids (`accounts-payable` palette / `accounts_payable` tarjeta) → misma vista | híbrido aceptado, documentar |

---

## 4. AUDITORÍA DE BREADCRUMBS — F-10 (ghost crumbs)

Mecánica: `getBreadcrumbForView` (derivado) + `NavigationBreadcrumb` global bajo el Header (`TerminalShell.tsx:636`); se oculta con ≤1 crumb (dashboard/calculator/chat/bank-reconciliation) ✓.

| Hallazgo | Evidencia |
|---|---|
| **11 deep-links con breadcrumb fantasma "Módulo No Disponible"**: `storefront-config` + `whatsapp-config/conversations/invitations/dashboard/group` + `telegram-*` (5) | Se renderizan (cases `TerminalShell.tsx:445,538-551`) pero `findDefinitionPath`=[] y no están en `VIEW_TO_HUB_MAP` (`navigation-map.ts:268-298`) → crumb falso al refrescar/bookmarkear la URL |
| Breadcrumb falso local en Gestión de Tiendas | `ManagementHubView.tsx:126-132` pinta `Inicio / MULTI-TIENDA / Gestión` — "MULTI-TIENDA" no existe en el árbol real; duplica el crumb global ya renderizado |
| Breadcrumb = 2º menú | NO: los crumbs intermedios navegan a hubs reales (GroupHubView/SectionHubView) — correcto |
| Comentario stale | `NavigationBreadcrumb.tsx:30-33` describe un estado antiguo del dashboard |

---

## 5. TÍTULOS Y CONTEXTO — F-02..F-09

Apilado real por vista: **Header h1 → crumb hoja → título de vista** (3 capas con el mismo string en las 5 vistas con PageHeader; con DISCORDANCIA en las demás).

| ID | Hallazgo | Evidencia |
|---|---|---|
| F-02 | Triple stack estructural (mismo string ×3, dos cajas distintas) | `Historial de Ventas`: Header h1 + crumb `navigation-map.ts:273` + `SalesHistoryView.tsx:280`; ídem `Caja` (×3) y `Reportes` (×3) |
| F-03 | `settings` con 3 identidades: menú "Ajustes" / h2 "Ajustes Globales" / error "Configuración" / menú usuario "Configuración" | `navigation-definition.ts:426` · `SettingsView.tsx:188` · `TerminalShell.tsx:457` · `Header.tsx:302` |
| F-04 | `management-hub`: nav "Gestión de Tiendas" vs h2 "Gestión" vs tab "Gestión Tiendas" vs crumb local "MULTI-TIENDA" | `navigation-definition.ts:294` · `ManagementHubView.tsx:68,127-138` |
| F-05 | **"TPV" como título de la vista Vender** (contradicción directa con la estructura certificada) | `POSView.tsx:405` h2 uppercase desktop-only |
| F-06 | `reception_list`: nav "Recepciones" vs error-boundary "Historial de Recepciones" | `TerminalShell.tsx:472` |
| F-07 | Cancelar Nueva Recepción → aterriza en **Inventario** (pierde el contexto Recepciones) | `TerminalShell.tsx:459` `onCancel={() => setCurrentView('inventory')}`; entrada real: `ReceptionsHistoryView.tsx:163,174,397` y palette `recepcion` |
| F-08 | `inventory` sin título propio (las tabs Stock/Catálogo/Trazabilidad actúan de header) | `InventoryView.tsx:813-820` — aceptable como patrón de tabs, pero rompe la voz común |
| F-09 | Splash del módulo Fichas usa el nombre RETIRADO "Tablero Principal" | `CostSheetView.tsx:492` (GATE 1.4R lo renombró a "Experto") |
| F-11 | PageHeader (F2) adoptado solo en **5** vistas; **~25** vistas con h1/h2 self-made en uppercase-CSS persistente | imports: DashboardView(clerk), SalesHub, SalesHistory, Reports, CashClosure; resto ver §Anexo A del agente de títulos |
| F-14 | DashboardView con nombre por rol: "Panel de Control" (clerk) vs "Tablero Consolidado" (admin h2) | `DashboardView.tsx:95-97` · `MultiStoreDashboardView.tsx:322` |
| F-15 | Botón POS "Registro" = tercer nombre del Historial de Ventas | `POSView.tsx:452` (destino `sales`) |
| F-16 | "Cerrar Sesion" sin tilde | `Header.tsx:310` |

---

## 6. NAVEGACIÓN MÓVIL — ✓ sana (fixtures F1 intactas)

- Tabs fijos 4+1 derivados (`MOBILE_MAIN_TABS`), estado activo por proceso (P2-5 corregido) ✓.
- Sheet "Más": agrupado por sección, dedupe de tabs fijos por construcción (`MobileTabBar.tsx:100`), ACCIONES al final ✓.
- Sidebar móvil: no se cierra al navegar (decisión certificada 2026-07-22); cierre solo por backdrop/X/toggle ✓. Guard de montaje para deep-links (drawer no restaurado) ✓.
- Colapsado persistido + botón 48px ✓.
- `costTabs` local del módulo Costo = subconjunto curado (por diseño, análogo al rail IPV) — documentado, no tocar.
- Densidad del sheet "Más" para admin: ~34 destinos en grid 3-col agrupados — denso pero organizado; reorganización mayor = fuera de F4 (E-class, documento).

---

## 7. PROGRESSIVE DISCLOSURE (Nivel 1/2/3)

| Nivel | Elementos | Evaluación |
|---|---|---|
| 1 — operación frecuente | Vender (1 clic desktop + tab móvil), Caja (tab móvil), Inventario (tab móvil), Recepciones (tab móvil "Recibir") | ✓ inmediatos |
| 2 — contextual | Hub Ventas (11 tarjetas PRIMARY/SECONDARY), submenús Almacén/Logística/Costo/Redes (colapsados por defecto), palette ⌘K con TODO (incl. herramientas cost-sheets) | ✓ correcto: los submenús requieren expansión; focus-mode aísla un módulo |
| 3 — admin/especializada | Sección SISTEMA (8, admin-only), EN DESARROLLO (3, admin-only), IPV/Pick3/Wallet marcados experimental | ✓ correctamente ocultos por rol |
| Riesgo de ocultamiento excesivo | Ninguna función crítica quedó fuera de todo camino (palette cubre ACTION_EXTENSIONS; `mobileHide` solo para widgets) | ✓ |

---

## 8. NOMENCLATURA (tabla mandato)

| Término actual | Contexto | Ambigüedad | Propuesta | Evidencia |
|---|---|---|---|---|
| TPV | h2 de la vista Vender | ALTA — contradice nav/crumb/Header "Vender"; término prohibido | Eliminar h2 (el Header ya titula "Vender") | `POSView.tsx:405` |
| Terminal de Venta | ayuda de atajos + prompt IA | MEDIA — resucita el término retirado | "Ir a Vender (POS)" / "Vender (POS)" | `useKeyboardShortcuts.ts:23` · `system-prompt-builder.ts:78` |
| Tabla IPV | toast visible + instrucciones Excel | MEDIA — nombre pre-renombramiento | "Tabla de Venta" | `useSalesCatalog.ts:630` · `salesCatalogExport.ts:660,664` |
| Caja (botón carrito POS) | toggle del carrito desktop | ALTA — colisiona con la vista Caja (cash) | "Carrito (n)" (ya lo dice el aria-label y móvil) | `POSView.tsx:426` |
| Registro (botón POS) | botón → view `sales` | MEDIA — 3er nombre del Historial | "Historial" | `POSView.tsx:452` |
| Ajustes Globales | h2 de settings | MEDIA — vs menú "Ajustes" | "Ajustes" | `SettingsView.tsx:188` |
| Configuración | menú usuario (→settings) | MEDIA — 4ª identidad de settings | "Ajustes" | `Header.tsx:302` |
| Gestión / MULTI-TIENDA | h2 + crumb local | ALTA — vs "Gestión de Tiendas" | alinear a "Gestión de Tiendas", eliminar crumb local | `ManagementHubView.tsx:127-138` |
| Tablero Principal | splash Fichas | MEDIA — nombre retirado GATE 1.4R | "Fichas de Costo" | `CostSheetView.tsx:492` |
| Dashboard de Tiendas | menú ANÁLISIS | ALTA — mismo destino que Inicio | candidato consolidación D (no tocar F4) | `navigation-definition.ts:341-351` |
| Recibir | tab móvil | BAJA — verbo para grupo Logística (certificado F1) | mantener | `MOBILE_MAIN_TABS:1200` |
| Hub | — | 0 ocurrencias visibles | — | ✓ limpio |
| Cerrar Sesion | menú usuario | BAJA — ortografía | "Cerrar Sesión" | `Header.tsx:310` |
| Sistema/Logística/Conteo/Tabla de Venta/Inicio | nav | consistentes | mantener | ✓ |

**No se tocará** vocabulario contable/operativo (Venta por Conteo, Cuentas por Pagar/Cobros, Cierre Fiscal, Costeo Dinámico).

---

## 9. VISTAS HUÉRFANAS (clasificación, sin borrado)

```text
A — accesible y válido      : 50/51 directorios de vistas mapean a un case real; 0 hojas muertas en menú/palette
B — accesible pero mal ubicado: (ninguno estructural; storefront-config vive en palette + hub Gestión — coherente)
C — legacy/deuda            : SidebarFocusMode.tsx y ui/Breadcrumbs.tsx (nunca importados, emiten 'occ');
                              branch interno `currentView === 'reception'` en InventoryView.tsx:804 (ViewType inexistente — inalcanzable);
                              RoleForm.AVAILABLE_VIEWS (labels inglés stale); TECHNICAL_DIRECT_ROUTES['customers'] (shadowed por IPV_ROUTES);
                              7 ids en TECHNICAL_VIEW_IDS ∩ ACTION_EXTENSIONS (doble clasificación documental);
                              VALID_VIEWS sin 'costo'; ViewType duplica 'production-orders'
D — posiblemente muerto     : directorio views/tenant/ (0 imports, solo un test) · OCCView.tsx + RecentCostSheets.tsx (solo test,
                              shell comenta "retirada") · 19 archivos cost_sheet/* etc. con 0 referencias (ver Anexo B)
```

**Decisión F4**: NO borrar código muerto (mandato). Solo se documentan. La excepción de "necesario para corregir contradicción" no se da: ningún muerto emite navegación viva (los 2 emisores 'occ' viven en componentes nunca montados).

---

## 10. JOURNEYS (evidencia de código; verificación en vivo en 04-F4-DEEP-LINKS)

| Journey | Camino | Entrada | Decisión/Acción | Salida | Vuelta | Hallazgo |
|---|---|---|---|---|---|---|
| A — Vender | Inicio→Vender (1 clic / tab móvil) | sidebar/tab | buscar→carrito→cobrar | feedback F3 | breadcrumb "Vender" + BackToVentaButton al hub | título interno TPV (F-05); botón "Caja" ambiguo (F-13); "Registro" 3er nombre (F-15) |
| B — Ventas | Ventas→Historial | tarjeta hub | seleccionar→anular/duplicar/exportar | toast | breadcrumb Ventas ✓ | ✓ sin pérdida |
| C — Inventario | Inventario→tabs | submenú/tab | filtrar→seleccionar→acción | toast | crumb `Almacén > Inventario` ✓; Catálogo/Trazabilidad cuelgan de Inventario ✓ | sin título de vista (F-08, aceptable) |
| D — Recepción | Recepciones→Nueva | tarjeta crumb/palette | registrar→confirmar | toast | **CANCELAR → Inventario ✗ (F-07)** | única pérdida de contexto real |
| E — Caja | Ventas→Caja / tab móvil | tarjeta/tab | abrir turno→operar→cierre | PageHeader dinámico | breadcrumb `Ventas > Caja` ✓ | ✓ |

---

## 11. MÉTRICAS ANTES (baseline medible)

| Métrica | Valor |
|---|---|
| Fuentes de verdad de navegación | **1** (navigation-definition.ts) + 6 listas locales menores aceptadas |
| Entradas al mismo destino con doble resaltado | 1 caso estructural (dashboard ×2 entradas) |
| Deep-links con breadcrumb fantasma | **11** |
| Identidades de un mismo view (labels contradictorios) | settings ×3 · management-hub ×4 · reception_list ×2 · pos ×2 (Vender/TPV) · sales ×3 (Historial/Registro/error) |
| Términos legacy visibles | TPV 1 · Terminal de Venta 2 · Tabla IPV 3 · Tablero Principal 1 · MULTI-TIENDA 1 |
| Vistas con PageHeader (F2) | 5 de ~40 con título; ~25 self-made h1/h2; 2 sin título |
| Vistas huérfanas (componentes sin montaje) | 26 (1 dir + 19 files + 3 test-only + 2 shell) |
| Destinos muertos en menú/palette | 0 |
| Pasos Journey A (Inicio→carrito listo) | 2 (Vender → escanear) ✓ óptimo |
| Pasos Journey D con vuelta correcta | cancelar = 1 paso a contexto ERRÓNEO |

## 12. CONCLUSIÓN DE AUDITORÍA

La IA de CostPro está **sana en su núcleo**: fuente única real, 0 destinos muertos, jerarquía Ventas certificada intacta, móvil derivado y guardado. Los problemas reales son de **superficie de contexto**: 11 crumbs fantasma, títulos que contradicen la navegación (TPV, Gestión, Ajustes Globales), una pérdida de contexto en Recepción, residuos de nomenclatura retirada y 1 duplicación estructural (dashboard) que requiere decisión de producto. Nada exige tocar backend, permisos, lógica de negocio ni reconstruir el shell.
