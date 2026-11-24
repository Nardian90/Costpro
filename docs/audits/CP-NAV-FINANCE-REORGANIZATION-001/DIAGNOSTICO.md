# CP-NAV-FINANCE-REORGANIZATION-001 — DIAGNÓSTICO (auditoría previa a la implementación)

Fecha: 2026-11-25 · Rama base: main d2c97db64 · Mecanismo: GATE 1 (fuente única de navegación)

## 1. Mecanismo real de la navegación (GATE 1)

Toda la navegación de COSTPRO deriva de UNA fuente única (`src/config/navigation/navigation-definition.ts`).
Las superficies son derivadas, no listas paralelas:

| Superficie | Origen | Archivo |
|---|---|---|
| Sidebar escritorio | `NAVIGATION_SECTIONS` → `SIDEBAR_STRUCTURE` | `sidebar.structure.ts` (derivado) |
| Sheet móvil «Más» | mismo árbol por sección | `mobile-sheet.ts` (derivado) |
| Guard de roles | `isViewAllowedForRole` (herencia del ancestro más cercano) | `sidebar.structure.ts` |
| Breadcrumb | `findDefinitionPath` sobre el árbol; `VIEW_TO_HUB_MAP` solo para contextuales | `navigation-map.ts` |
| Command Palette (⌘K) | `SYSTEM_ACTIONS` = `flattenNavigation()` + `ACTION_EXTENSIONS` (sin dedup) | `src/config/actions.ts` |
| Render de vistas | `case <ViewType>` en el switch | `TerminalShell.tsx` |
| Contrato de tipos | `ViewType` = union literal | `src/store/index.ts` |
| Registro para IA/ayuda | `VIEW_REGISTRY` | `src/config/viewRegistry.ts` |

Conclusión: mover/renombrar una categoría NO requiere tocar el Sidebar ni el sheet móvil —
solo la definición y sus anclas derivadas.

## 2. Estado actual de los tres objetivos

### 2.1 Categoría CAJA
- `operacion.children` → `{ id: 'caja', label: 'Caja', icon: Landmark, type: 'submenu', navClass: 'hub' }`
  (navigation-definition.ts ≈ L283-318). Sin `roles` propios: hereda de la sección OPERACIÓN
  (admin/manager/encargado/clerk/usuario/warehouse) para su vista-hub; cada hijo gatea por sí mismo.
- Hijos: `cash` (roles admin/manager/encargado/clerk/usuario, `mobileHide`) e `ingresos_egresos`
  (roles admin/manager/encargado/clerk).
- ViewType-hub `'caja'` presente en `ViewType`, `VALID_VIEWS` y `viewRegistry`; render en
  TerminalShell L590 (`case 'caja'` → SectionHubView).

### 2.2 Servicios Recibidos
- Hoja `received-services` bajo `almacen_operaciones` (Logística) — navigation-definition ≈ L432-439.
  ViewType `received-services`, roles admin/manager/encargado/warehouse, icon Truck, sin `route`
  (el id ES la ruta `/?view=received-services`). Vista: `ReceivedServicesView.tsx` (comentario de
  encabezado aún documenta la ubicación Logística).
- Residuo textual: `src/config/work-dates/movement-types.ts` L143 — `selectorLocation:
  'Logística → Servicios Recibidos → …'` y `area: 'Logística'` (copy informativo, no lógica).

### 2.3 Cuentas por Pagar / Cuentas por Cobrar
- Viven como EXTENSIONES DE PALETTE (`SALES_HUB_PALETTE_ENTRIES`, navigation-definition
  L1064-1084), no como hojas de menú: aparecen como TARJETAS del hub Ventas → Opciones
  (`SECONDARY_CARDS` en `SalesHubView.tsx` L228-248, lista propia con id/view) y en ⌘K.
  - `accounts-payable` (id kebab) → route `{ view: 'accounts_payable' }` (snake). Roles
    admin/manager/encargado/clerk/usuario. `mobileHide: true`.
  - `accounts-receivable` (id kebab, label «Cobros por Antigüedad») → route `{ view: 'accounts_receivable' }`.
    Mismos roles. `mobileHide: true`.
- ViewTypes renderizables: `accounts_payable` (case doble en TerminalShell L612-613) y
  `accounts_receivable` (L614). `VALID_VIEWS` contiene snake y la kebab `accounts-payable`.
- Breadcrumb: `VIEW_TO_HUB_MAP` cuelga las tres claves (kebab/snake) del hub `sales-hub`.
- Rutas técnicas: `TECHNICAL_DIRECT_ROUTES` mantiene los ids kebab/snake (compat deep-link).
- E2E de Cuentas por Pagar navega por deep-link `/?view=accounts_payable` (no pasa por el menú).
- `RecommendedActions.tsx` (Inicio) navega por ViewType canónico `accounts_receivable` — se adapta solo.

## 3. Impacto previsto de la reorganización (diseño de la solución)

1. **CAJA → FINANZAS**: renombrar id `caja`→`finanzas`, label `FINANZAS`, icon `Wallet`.
   Compatibilidad: alias legacy `caja → finanzas` en `LEGACY_VIEW_ALIASES` (store/URL/hub lo
   normalizan); `caja` permanece en `ViewType`/`VALID_VIEWS`/viewRegistry/TerminalShell (deep-links).
2. **Servicios Recibidos**: mover el bloque `received-services` de Logística a FINANZAS (mismo
   ViewType, ruta, roles, icono y keywords — cero duplicación). Logística conserva Recepciones,
   Órdenes de Compra y Transferencias (su `description` deja de mencionar servicios).
3. **Cuentas por Cobrar / Pagar**: graduación del patrón documentado usado con `cash` (2026-10-20):
   se retiran de `SALES_HUB_PALETTE_ENTRIES` (para no duplicar en ⌘K, que ya deriva del árbol) y
   se publican como HOJAS de FINANZAS con id = ViewType (snake, sin `route`), roles EXACTOS de la
   extensión, sin `mobileHide` (para que el sheet móvil las exponga bajo FINANZAS — punto central).
   Label de la hoja de cobros: «Cuentas por Cobrar» (estructura final obligatoria del mandato).
4. **Tarjetas de Opciones**: retirar las dos tarjetas de `SECONDARY_CARDS` (el mandato exige que
   Ventas → Opciones deje de mostrar Cuentas por Pagar y el punto único de acceso obliga a
   retirar también la de cobros; la vista sigue accesible desde FINANZAS, ⌘K y deep-link).
5. **Breadcrumb**: retirar las 3 claves de `VIEW_TO_HUB_MAP` → ahora derivan del árbol
   (Inicio > OPERACIÓN > FINANZAS > …), patrón ya aplicado a `cash`/`cash_report`.
6. **Derivados automáticos (sin tocar)**: sidebar.structure, mobile-sheet (sheet «Más» mostrará
   FINANZAS con las 5 hojas), filtro por rol, RecommendedActions, e2e por deep-link.
7. **Anclas a actualizar**: `ViewType` (+`finanzas`), `VALID_VIEWS` (+`finanzas`),
   TerminalShell (`case 'finanzas'`), viewRegistry (entrada hub `finanzas`), view-tips (`sales-hub`
   ya no menciona cuentas), prompt IA (catálogo de viewIds), movement-types (selectorLocation),
   comentarios de ReceivedServicesView.
8. **Permiso-por-permiso (sin cambios)**: los roles declarados en cada hoja se copian EXACTOS de
   la fuente; el grupo FINANZAS no declara `roles` (igual que hoy CAJA) → la herencia efectiva
   queda idéntica.
9. **Tests con contrato vigente a actualizar**: `caja-navigation.test.ts` (estructura OPERACIÓN→Caja),
   `gate1-navigation.test.ts` (L338 extensiones del hub; L360 submenu `caja`; lista de hubs del
   test C). Sin cambios en fin-navigation, superadmin-regression, mobile-tabbar-parity (no tocan).

## 4. Riesgos y decisiones

- **Orden de hijos de FINANZAS**: estructura final obligatoria del mandato primero
  (Servicios Recibidos · Cuentas por Cobrar · Cuentas por Pagar) + accesos conservados después
  (Caja · Ingresos/Egresos). No se elimina ningún módulo.
- **Resaltado de tabs móviles** (`MOBILE_MAIN_TABS.activeViews`): se conserva EXACTO (el estado
  activo móvil deriva del PROCESO — doc del propio archivo; `received-services` sigue en «Recibir»,
  cuentas en «Vender»). Cero regresión; la navegación móvil a las tres vistas llega vía sheet «Más».
- **Gate «buscar caja = 1 acción»**: el label FINANZAS no contiene «caja»; la hoja `cash` conserva
  su keyword — el contrato del Gate 1 se mantiene.
- **Labels únicos**: «Cuentas por Cobrar» no colisiona (el label anterior «Cobros por Antigüedad»
  desaparece con la extensión retirada). El test gate1-D exige labels únicos — verificado.
