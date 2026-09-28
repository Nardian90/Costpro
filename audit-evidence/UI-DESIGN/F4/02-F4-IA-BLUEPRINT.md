# F4-B — INFORMATION ARCHITECTURE BLUEPRINT

Fecha: 2026-09-28 · Base: `audit/f4-information-architecture` @ `60dd04ac` · Entrada: `01-F4-AUDIT.md`

Clasificación A–F (mandato GATE F4-B). Cada entrada cita la evidencia de la auditoría.
Regla transversal: **Regla de No-Sorpresa** — nada que un usuario actual pueda perder.

---

## A — MANTENER (correcto y claro)

| Elemento | Razón |
|---|---|
| `navigation-definition.ts` como fuente única + derivadores (Sidebar/Breadcrumb/Palette/Header/Mobile) | Arquitectura GATE 1 viva, 0 destinos muertos, contract ViewId activo |
| Estructura `OPERACIÓN → Vender` + hub `Ventas` (Tabla, Historial, Caja, Conteo, Devoluciones, Cotizaciones, Cobros) | Certificada F1; task book la congela |
| `Ficha de Costo` como submenú de Costo (no eje principal) + rail interno del módulo | Mandato cumplido; Análisis de Fichas en ANÁLISIS vía route+tab |
| MobileTabBar 4+1 tabs + sheet "Más" derivado + dedupe + estado activo por proceso | F1 certificado; sin contradicción encontrada |
| Deep-link contract `/?view=X&tab=Y` + aliases legacy + saneamiento de rehidratación | Tests gate1 verdes; 22 alias con destino válido |
| Guard de roles UI + "Acceso Denegado" con vuelta al Inicio | No se toca (permisos fuera de alcance) |
| Sub-menús colapsados por defecto + focus mode + fijados (pins) + palette ⌘K | Progressive disclosure Nivel 2/3 correcto |
| Patrones hub (tarjeta + palette + breadcrumb) de Ventas/Gestión/Redes | Intencionales, documentados en GATE 1.3/1.4P |
| Vocabulario contable (Venta por Conteo, Cuentas por Pagar/Cobros, Cierre Fiscal) | Significado operativo/contable establecido — no se renombra |

## B — REUBICAR (función válida, mal contextualizada)

| ID | Elemento | Problema | Acción F4 | Riesgo |
|---|---|---|---|---|
| F-07 | Cancelación de Nueva Recepción → `inventory` | Pierde el contexto Recepciones (Journey D); ambas entradas (hub Recepciones "Nueva" y palette "Nueva Recepción") pertenecen al dominio Recepciones | `TerminalShell.tsx:459`: `onCancel` → `setCurrentView('reception_list')` | Bajo — 1 línea; sin test que fije el destino anterior |
| F-10 | 11 deep-links sin contexto: `storefront-config`, `whatsapp-config/conversations/invitations/dashboard/group`, `telegram-*` | Breadcrumb fantasma "Módulo No Disponible" al refrescar/bookmarkear (se renderizan pero `findDefinitionPath`=[] y no están en `VIEW_TO_HUB_MAP`) | Añadir entradas a `VIEW_TO_HUB_MAP`: `storefront-config → management-hub` ("Vitrina Pública"); `whatsapp-* → whatsapp-hub` y `telegram-* → telegram-hub` con leaf = nombre del tab (Configuración/Conversaciones/Invitaciones/Dashboard/Grupo) | Bajo — solo añade mapeos; el fallback "Módulo No Disponible" se PRESERVA para strings desconocidos (test §6 gate1-viewid-contract) |

## C — RENOMBRAR (concepto correcto, label ambiguo)

| ID | Término actual | Propuesto | Evidencia | Riesgo |
|---|---|---|---|---|
| F-05 | h2 "TPV" (vista pos) | **Eliminar el h2** — el Header global ya titula "Vender" y el task book prohíbe el término | `POSView.tsx:405`; contradice `navigation-definition.ts:119` | Bajo — h2 desktop-only; el header + breadcrumb ya dan contexto |
| F-13 | Botón carrito POS "Caja (n)" | "Carrito (n)" | `POSView.tsx:426` vs vista `cash` "Caja"; aria-label y móvil ya dicen "carrito" | Bajo — actualizar test `pos-cart-counter.test.tsx:91` ("Caja (1)"→"Carrito (1)"); keyword-test "caja" de palette no afectado (usa keywords de nav, no este botón) |
| F-15 | Botón POS "Registro" | "Historial" | `POSView.tsx:452` → view `sales` "Historial de Ventas" | Bajo |
| F-03 | h2 "Ajustes Globales" | "Ajustes" | `SettingsView.tsx:188` vs menú `navigation-definition.ts:426` | Bajo |
| F-03b | Menú usuario "Configuración" | "Ajustes" | `Header.tsx:302` — 4ª identidad de settings | Bajo |
| F-04 | h2 "Gestión" + tab "Gestión Tiendas" | "Gestión de Tiendas" | `ManagementHubView.tsx:68,138` vs nav `navigation-definition.ts:294` | Bajo |
| F-09 | Splash "Tablero Principal" | "Fichas de Costo" | `CostSheetView.tsx:492`; GATE 1.4R retiró el nombre | Bajo — string de splash |
| F-12 | "Terminal de Venta" (2 residuos vivos) | "Vender (POS)" | `useKeyboardShortcuts.ts:23` · `system-prompt-builder.ts:78` | Bajo — texto de ayuda/prompt; nav keywords intactas (test :270-275 sigue pasando) |
| F-12b | Toast "Tabla IPV limpiada" + instrucciones Excel "Tabla IPV" | "Tabla de Venta" | `useSalesCatalog.ts:630` · `salesCatalogExport.ts:660,664` | Bajo |
| F-06 | Error-boundary "Historial de Recepciones" | "Recepciones" | `TerminalShell.tsx:472` | Bajo — solo visible en error |
| F-16 | "Cerrar Sesion" | "Cerrar Sesión" | `Header.tsx:310` | Nulo |
| F-11 | h2 self-made → PageHeader (F2) donde el cambio sea 1:1 | PageHeader | ALCANCE LIMITADO: solo vistas de alto tráfico ya auditadas (`ReceptionsHistoryView`, `SalesCatalogView`, `InventoryCountView`) — el resto de las ~25 es deuda P3 (Principio de Mínimo Cambio) | Medio-bajo — cada una es un cambio local de encabezado |

## D — CONSOLIDAR (mismo concepto, varias entradas) — *documentar, NO eliminar en F4*

| ID | Duplicación | Estado real | Decisión |
|---|---|---|---|
| F-01 | "Inicio" (fijo) vs "Dashboard de Tiendas" (ANÁLISIS) — **mismo view `dashboard`**, doble resaltado activo simultáneo | No son conceptos distintos: un destino, dos labels | **Candidato de consolidación (requiere decisión de producto).** F4 NO elimina ninguna entrada (no-sorpresa). Se documenta el costo: ambigüedad + doble highlight |
| F-17 | "Mi Perfil" y "Configuración" (menú usuario) → ambos `settings` | Dos entradas, un destino | Candidato D (fusión Mi Perfil⊂Ajustes). F4 solo alinea el label "Configuración"→"Ajustes" (C-F03b); la fusión es decisión de producto |
| F-18 | `accounts-payable` vs `accounts_payable` (dos ids, una vista) | Híbrido histórico aceptado en map/aliases | Mantener; documentado |
| — | Tarjetas de hub + palette + tabs (cash/sales/pos/inventory…) | Patrón hub intencional GATE 1.3/1.4P | MANTENER (no es duplicación dañina) |

## E — PROGRESSIVE DISCLOSURE (pendientes de mayor envergadura)

| Elemento | Observación | Decisión F4 |
|---|---|---|
| Sheet "Más" móvil (admin ~34 destinos, grid 3-col, agrupado) | Denso pero organizado por secciones con encabezados | No reestructurar en F4 (riesgo de pérdida de descubribilidad); documentado |
| Triple apilado de títulos (Header h1 + crumb hoja + título de vista) en TODAS las vistas de hoja | Estructural: corregirlo = tocar Header + ~40 vistas → viola Principio de Mínimo Cambio (20+ vistas) | **Fuera de F4** — recomendación para fase futura: suprimir el h1 del Header cuando la vista declara PageHeader (requeriría registro canónico "vista→titulo" ya existente en la definición) |
| Palette ⌘K con acciones de cost-sheets (guardar/exportar/importar) | Acciones mezcladas con navegación | Documentado; patrón GATE 1.4R deliberado |

## F — LEGACY (no tocar en F4; documentar)

| Elemento | Nota |
|---|---|
| 26 componentes huérfanos (tenant/, OCCView, RecentCostSheets, 13 en cost_sheet/, SidebarFocusMode, ui/Breadcrumbs.tsx, etc.) | Sin montaje; 2 llevan emisores 'occ' pero inalcanzables. Borrado = otra fase (limpieza técnica) |
| Branch `currentView === 'reception'` en InventoryView.tsx:804 | Inalcanzable ('reception' no es ViewType) |
| `RoleForm.AVAILABLE_VIEWS` (users/RoleForm.tsx:29-37) | Matriz de permisos con labels inglés stale — tocarla roza lógica de permisos (FUERA de alcance) |
| `MobileTabBar.costTabs` local (5 tabs del módulo Costo) | Curada por diseño (análogo al rail IPV); documentada |
| `HelpLauncher.HELP_DOC_BY_VIEW` con key legacy 'occ' | Mapa ayuda→vista; inocuo |
| Doble clasificación 7 ids en TECHNICAL_VIEW_IDS ∩ ACTION_EXTENSIONS + VALID_VIEWS sin 'costo' + ViewType con 'production-orders' duplicado + `TECHNICAL_DIRECT_ROUTES['customers']` shadowed | **Higiene de configuración** — se corrige SOLO lo de riesgo nulo y verificable (ver §Implementación P2-H): eliminar el shadowed 'customers', añadir 'costo' a VALID_VIEWS, limpiar dual-membership con comentario; el duplicado del ViewType se deja (unión de tipos, efecto runtime nulo) |

---

## CONTRATO DE NO-CONTRADICCIÓN (validación GATE F4-C)

1. **F1 (mobile operational UX)**: no se toca MobileTabBar (tabs, sheet, collapse, safe-areas), ni sidebar-drawer behavior, ni touch targets. → sin contradicción
2. **F2 (design system)**: PageHeader/se usará donde ya existe; los nuevos encabezados (C-F11 limitado) usan el componente F2 con su tipografía. No se rediseña tipografía. → sin contradicción
3. **F3 (estados/overlays/feedback)**: no se tocan useFocusTrap, toasts de error/éxito, modales, Escape; el cambio de F-07 solo cambia el DESTINO de un cancel ya existente. → sin contradicción
4. **Permisos/lógica de negocio**: 0 cambios de roles, rutas backend, API, datos. Los guards `isViewAllowedForRole` y `COSTO_ALLOWED_VIEWS` quedan intactos. → sin contradicción
5. **Deep-links**: solo se AÑADEN mappings de breadcrumb; ningún id/route/alias se elimina ni renombra (los destinos siguen idénticos). Deep-link contract preservado → validar en 04.
6. **Segunda fuente de verdad**: NO se crea navigation2/mobile-navigation/sales-navigation; toda adición vive en `navigation-map.ts` (VIEW_TO_HUB_MAP) o en los componentes existentes.

## PLAN DE IMPLEMENTACIÓN (GATE F4-D)

**P1 — alto impacto, bajo riesgo (6 bloques):**
1. F-10: VIEW_TO_HUB_MAP +11 entradas (breadcrumb fantasma → contexto real).
2. F-05: eliminar h2 "TPV" de POSView.
3. F-07: onCancel de recepcion → `reception_list`.
4. F-04: ManagementHubView — eliminar breadcrumb local duplicado + h2 "Gestión"→"Gestión de Tiendas" (tab "Gestión Tiendas"→"Gestión de Tiendas").
5. F-03: SettingsView h2 → "Ajustes"; Header menú usuario "Configuración"→"Ajustes".
6. F-09: splash "Tablero Principal"→"Fichas de Costo".

**P2 — nomenclatura secundaria + higiene:**
7. F-13: POS carrito "Caja (n)"→"Carrito (n)" (+ test pos-cart-counter).
8. F-15: POS "Registro"→"Historial".
9. F-12/F-12b: "Terminal de Venta" ×2 → "Vender (POS)"; "Tabla IPV" ×3 → "Tabla de Venta".
10. F-06: error-name "Historial de Recepciones"→"Recepciones"; F-16: "Cerrar Sesion"→"Cerrar Sesión".
11. F-11 (limitado): PageHeader en ReceptionsHistoryView, SalesCatalogView, InventoryCountView (encabezado 1:1, sin nuevo diseño).
12. Higiene config: TECHNICAL_DIRECT_ROUTES sin 'customers' shadowed; VALID_VIEWS + 'costo'; TECHNICAL_VIEW_IDS sin los 7 dual-membership (con comentario hacia ACTION_EXTENSIONS).

**P3 (no bloquea F4):** PageHeader en las ~22 vistas restantes; consolidación dashboard (D); fusión Mi Perfil (D); limpieza de muertos (F); reestructuración del sheet "Más" (E); triple-stack estructural (E).

**Verificación tras cada bloque**: TypeScript → ESLint → tests relevantes → smoke en servidor pm2 → anotar en 03.
