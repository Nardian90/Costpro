# GATE 1.4 — 13 FINDINGS (GATE 18 · clasificación completa de hallazgos)

Fecha: 2026-09-21 · Formato por hallazgo: ID · SEVERITY · DOMAIN · CURRENT STATE · USER IMPACT · EVIDENCE · ROOT CAUSE · RECOMMENDATION · IMPLEMENTATION COMPLEXITY · REGRESSION RISK. Estado de TODOS: **OBSERVED / IMPLEMENTATION: DEFERRED** (§31 — nada se corrige en este gate).

---

## UX-001 · P0 · Costo/Fichas de Costo
- **CURRENT**: Arena FC (comparador de fichas con motor propio) sin NINGÚN camino de UI: 0 triggers en src/, palette invisible ("arena"→gen-easy), menú no, sheet móvil no.
- **IMPACT**: capacidad diferencial construida y documentada en tips, inalcanzable para todo usuario salvo deep-link manual. Pérdida total de la inversión de la feature.
- **EVIDENCE**: grep `setActiveSection('arena-fc')` = 0; browser deep-link ✓ renderiza; palette-raw-results.md ("arena").
- **ROOT CAUSE**: la consolidación GATE 1 (21 hojas → 1 entrada cost-sheets) rehízo el menú pero no re-anchó las secciones internas no-editor (arena, templates, masiva, estructural) a ningún canal.
- **RECOMMENDATION**: entrada como tarjeta/vista dentro del dominio Fichas de Costo (ver 14 §FC-hub), con roles explícitos y badge beta.
- **COMPLEXITY**: Baja (1 entrada en definición + tarjeta hub o paletización).
- **REGRESSION RISK**: Bajo (no toca rutas existentes; VALID_VIEWS ya contiene el destino).

## UX-002 · P0 · Shell/Breadcrumb/Header
- **CURRENT**: vistas reales fuera del árbol y fuera de VIEW_TO_HUB_MAP muestran breadcrumb "… > MÓDULO NO DISPONIBLE" y el Header H1 "Módulo No Disponible" aunque el componente renderiza (storefront-config, customers, bank-reconciliation, ofertas verificadas en browser).
- **IMPACT**: el usuario cree que la app se rompió / que no tiene permiso; el "Ir al Dashboard" del caso real no aparece (porque no es el caso real) y el breadcrumb no es navegable al padre correcto. Golpea la confianza y la recuperabilidad.
- **EVIDENCE**: 09-deep-links.md (matriz), screenshots storefront-config-broken.png; navigation-map.ts:368-373; TerminalShell Header título derivado.
- **ROOT CAUSE**: el fallback del breadcrumb (E-Fix) asume "fuera de la definición = no implementada"; no existe registro canónico de vistas técnicas con LABEL (TECHNICAL_VIEW_IDS es una lista plana sin metadatos).
- **RECOMMENDATION**: dar LABEL/dominio a las vistas técnicas (registro técnico con metadatos en navigation-definition) y que breadcrumb/header consuman ese registro; fallback "Módulo No Disponible" solo para verdaderos desconocidos.
- **COMPLEXITY**: Media. **REGRESSION RISK**: Medio (toca breadcrumb — validar GATE 1.1 contrato ViewId y tests de breadcrumb).

## UX-003 · P1 · Costo (Modo Asistido · Informe)
- **CURRENT**: modos del editor invisibles como capacidad: palette "asistido"=0 resultados (medido), "informe"→Reportes (falsa pista); sin ficha abierta no existe camino.
- **IMPACT**: onboarding guiado (Asistido) y salida formal (Informe) — dos de los valores principales del módulo — solo descubribles tras abrir una ficha y encontrar el panel flotante.
- **EVIDENCE**: palette-raw-results.md; CostSheetActionsPanel (botones Asistido/Informe); useCostSheetActions handleSetViewMode.
- **ROOT CAUSE**: modelado correcto como MODOS pero sin representación en ningún canal de descubrimiento (palette solo lista vistas/acciones de ACTION_EXTENSIONS).
- **RECOMMENDATION**: entradas de ACCIÓN en palette ("Abrir Modo Asistido", "Generar Informe") que abran ficha/módulo y activen el modo; no convertir en tarjetas-vistas.
- **COMPLEXITY**: Media (requiere acciones con handler, no solo route). **REGRESSION RISK**: Bajo-Medio.

## UX-004 · P1 · Terminología/Dashboards
- **CURRENT**: 4 conceptos con vocabulario superpuesto: Inicio (TABLERO CONSOLIDADO), Dashboard de Tiendas (ANÁLISIS), "Dashboard" + "Dashboard KPI avanzado" + "Dashboard avanzado" (3 labels en la misma card de tienda), Tablero Dinámico (fichas).
- **IMPACT**: el novato no distingue qué tablero muestra qué; ambigüedad medida (GATE 8 #3, #11; Consistency 1/3).
- **EVIDENCE**: browser dashboard cards; definición ANÁLISIS; view-tips.
- **ROOT CAUSE**: crecimiento orgánico de labels sin glosario.
- **RECOMMENDATION**: glosario 12-information-architecture.md (Inicio / Comparativa de Tiendas / Dashboard de la tienda / Análisis de Fichas) + un solo label por botón.
- **COMPLEXITY**: Baja (labels). **REGRESSION RISK**: Bajo (keywords deben actualizarse juntas).

## UX-005 · P1 · Gestión de Tiendas (Tablón default + Warehouses)
- **CURRENT**: el tab DEFAULT del hub es Tablón Noticias (transversal); Almacenes y Depósitos cuelga de Gestión de Tiendas en desktop pero de Inventario en móvil.
- **IMPACT**: "Gestión de Tiendas" no entrega lo que promete de primero; destino de Almacenes inconsistente entre canales.
- **EVIDENCE**: ManagementHubView (default 'news'); navigation-map VIEW_TO_HUB_MAP.warehouses→management-hub vs MOBILE_MAIN_TABS inventory.activeViews incluye warehouses.
- **ROOT CAUSE**: GESTION-UNIFICADA-V2 (2026-07-13) puso noticias primero por conveniencia; warehouses nunca tuvo dueño claro.
- **RECOMMENDATION**: default del hub = Gestión Tiendas; Almacenes → dominio Almacén/Logística (o decidir su función real y documentarla).
- **COMPLEXITY**: Baja. **REGRESSION RISK**: Bajo (localStorage mgmt-hub-tab ya migra con guard).

## UX-006 · P2 · Vitrina doble entrada + nombres
- **CURRENT**: tab "Vitrina" (hub) y vista "Vitrina Pública" (palette, storefront-config) — mismo componente, 2 nombres, y la 2ª con UX-002.
- **IMPACT**: confusión menor de canales; la entrada palette se ve rota (no lo está).
- **EVIDENCE**: 11-duplication D-2; screenshots.
- **RECOMMENDATION**: unificar nombre y decidir UNA entrada canónica (tab del hub con preselección por route {view,tab} o vista standalone con breadcrumb propio).
- **COMPLEXITY**: Baja. **REGRESSION RISK**: Bajo.

## UX-007 · P1→consolidado · Móvil
- Ver 08-mobile.md: UX-007c drawer abierto al cargar (P2), UX-007d sheet MÁS plano y largo con Costo enterrado (P2), UX-007a/b labels truncados y OCULTAR (P3), UX-007e las capacidades ocultas lo son también en móvil (agrava P0/P1).
- **RECOMMENDATION**: plegado por sección en sheet, estado inicial del drawer por breakpoint, revisión de labels 4+1.

## UX-008 · P2 · Palette acciones ausentes + falsos positivos
- **CURRENT**: la palette no ofrece ACCIONES de dominio (exportar/importar/guardar ficha, abrir turno) y el fuzzy produce falsos positivos ("json"→Usuarios/Vitrina).
- **EVIDENCE**: 07-command-palette.md.
- **RECOMMENDATION**: ACTION_TYPES en la definición (acciones con handler) + ajuste de umbral/keywords.
- **COMPLEXITY**: Media. **REGRESSION RISK**: Bajo.

## UX-009 · P3 · Legacy storeId vs activeStoreId
- **CURRENT**: UserContract.storeId @deprecated convive con activeStoreId (profiles.active_store_id es la verdad); uso residual en hooks.
- **RECOMMENDATION**: plan de migración para purgar storeId (Fase F). **COMPLEXITY**: Media. **RISK**: Medio (RLS y hooks).

## UX-010 · P1 · Ofertas / Clientes / Conciliación sin dominio
- **CURRENT**: 3 vistas completas sin camino (05-orphan-inventory) + UX-002 encima.
- **RECOMMENDATION**: asignar dominio (Ventas>Ofertas, Ventas o Inventario>Clientes, ANÁLISIS>Conciliación) o declararlas LEGACY y ocultarlas formalmente.
- **COMPLEXITY**: Baja por vista. **REGRESSION RISK**: Bajo.

## UX-013 · P3 · Sesión envejecida sin gate visible
- **CURRENT**: con cookies limpias el shell sigue renderizando con usuario del store local hasta que un fetch falle (unauth-view-pos.png).
- **RECOMMENDATION**: purgar store + redirigir a /?login=1 ante 401 global. **COMPLEXITY**: Media. **RISK**: Medio.

## UX-014 · P2 · Fichas de Costo: sin listado de fichas descubrible en terminal
- **CURRENT**: en el terminal, "ver mis fichas existentes" no tiene entrada visible desde gen-easy (la gestión de fichas está en el editor `main` y en el MVP /fc/); el flujo natural del novato se detiene en GENERAR FÁCIL.
- **EVIDENCE**: GATE 8 tarea #2; GenEasyView sin enlace a listado.
- **RECOMMENDATION**: entrada "Mis fichas" (lista) como vista/tab del dominio o el hub propuesto en 14.
- **COMPLEXITY**: Media (depende de qué existe en el editor para listar). **RISK**: Bajo.

---

Resumen por severidad: **P0: 2 (UX-001, UX-002) · P1: 6 (UX-003, UX-004, UX-005, UX-007, UX-010, UX-014) · P2: 4 (UX-006, UX-008, UX-013, 009-derivados) · P3: 3 (UX-009, labels móviles, D-4/D-9 legacy)**.
Todos los hallazgos: STATUS=OBSERVED, IMPLEMENTATION=DEFERRED a gates posteriores.
