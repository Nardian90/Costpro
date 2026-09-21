# GATE 1.4 — 15 REMEDIATION PLAN (GATE 24 · NO IMPLEMENTAR — plan por fases)

Fecha: 2026-09-21 · Cada fase: archivos probables · riesgo · dependencias · tests · criterios de aceptación. Orden A→F (recuperar ANTES que embellecer).

---

## FASE A — Recuperación de accesos (resuelve P0 UX-001, parte de UX-010/UX-014)
**Objetivo**: toda capacidad existente tenga camino (menú/hub/palette). Cero cambios de semántica todavía.
- **Archivos probables**: `navigation-definition.ts` (entradas nuevas o ACTION_EXTENSIONS), `navigation-map.ts` (VIEW_TO_HUB_MAP/rutas técnicas con label), `TerminalShell.tsx` (solo si una tarjeta nueva necesita handler), `view-tips.ts` (tips de lo rescatado).
- **Contenido**: Arena FC como entrada del dominio Costo; Ofertas/Clientes/Conciliación con dominio asignado o LEGACY formal; registro con LABEL para vistas técnicas (base anti UX-002).
- **Riesgo**: Bajo-Medio (VALID_VIEWS ya contiene los viewIds; la entrada nueva puede colisionar con tests de conteo del sidebar).
- **Dependencias**: ninguna externa; decisión de producto sobre vigencia de Ofertas/Conciliación.
- **Tests necesarios**: unit de definición (cada hoja → VALID_VIEWS), tests existentes de navegación (43), nuevo test "toda vista registrada tiene breadcrumb sin 'Módulo No Disponible'".
- **Aceptación**: (1) Arena FC alcanzable ≤3 clics y por palette; (2) 0 vistas reales con breadcrumb falso; (3) novato encuentra Ofertas/Clientes si se deciden visibles.

## FASE B — Corrección semántica (UX-005, UX-004, UX-006)
**Objetivo**: cada elemento en su dominio; un solo nombre por concepto.
- **Archivos**: `navigation-definition.ts` (labels/dominios), `navigation-map.ts` (warehouses→Almacén), `ManagementHubView.tsx` (default tab 'stores'), labels de cards del Dashboard, `view-tips.ts`.
- **Contenido**: Tablón deja de ser default; Almacenes y Depósitos al dominio Almacén; glosario (Comparativa de Tiendas / Análisis de Fichas / Dashboard de la tienda); Vitrina nombre único.
- **Riesgo**: Medio (renombrar labels puede afectar tests que asertren labels y keywords de palette).
- **Dependencias**: Fase A (los registros con label).
- **Tests**: suite de navegación + snapshot de palette por rol.
- **Aceptación**: (1) default del hub = Tiendas; (2) warehouses con breadcrumb coherente en desktop y móvil; (3) un solo label por concepto en glosario 12.

## FASE C — Hubs (Fichas de Costo como hub real, §5/§13 del mandato)
**Objetivo**: hub Fichas de Costo con jerarquía (hero Generar + Mis fichas + Análisis + Plantillas + Arena + Herramientas), modos SIGUEN en el editor.
- **Archivos**: `navigation-definition.ts` (estructura del hub), nuevo `SalesHub`-like `CostSheetsHubView` o extensión de SectionHubView, `MobileTabBar` (card-grid móvil), `view-tips.ts`.
- **Riesgo**: Medio (nueva superficie; no tocar el editor internamente).
- **Dependencias**: Fases A y B.
- **Tests**: navegación, móvil 375/390, deep-links de tabs existentes siguen funcionando (compat gen-easy/cost-analytics/view-assisted…).
- **Aceptación**: (1) todas las capacidades del módulo ≤2 clics desde el hub; (2) 0 duplicación del editor; (3) mobile parity.

## FASE D — Contexto de tienda activa (UX-009)
**Objetivo**: purgar legacy `storeId`; un solo concepto de tienda activa; sin re-selección redundante.
- **Archivos**: `contracts/user.ts`, `useSessionManager.ts`, hooks con storeId residual, `auth-middleware.ts` (solo lectura de la misma fuente).
- **Riesgo**: Medio (RLS depende de activeStoreId; hooks distribuidos).
- **Dependencias**: ninguna de A-C (puede correr en paralelo con C).
- **Tests**: integración de sesión, multi-tienda (fixtures existentes), RLS smoke.
- **Aceptación**: 0 referencias activas a storeId deprecado; 1 sola fuente; selector de tienda con 1 canal primario + palette.

## FASE E — Mobile / Palette / Breadcrumbs (UX-007, UX-008, UX-002-restos)
**Objetivo**: unificar canales.
- **Archivos**: `MobileTabBar.tsx` (sheet plegado, drawer inicial), `actions.ts`+`CommandPalette.tsx` (capa de ACCIONES con handlers, keywords json/importar/exportar), breadcrumb fn (registro técnico con label ya de Fase A).
- **Riesgo**: Medio (palette con acciones ejecutables requiere guards por rol).
- **Dependencias**: A (labels), C (hub para acciones de fichas).
- **Tests**: móvil 375/390/768, palette por rol, breadcrumb snapshot.
- **Aceptación**: (1) palette encuentra "asistido", "informe", "json", "arena" con acciones/vistas correctas; (2) sheet móvil plegado con Costo/Tiendas visibles; (3) 0 "Módulo No Disponible" en breadcrumbs de vistas reales.

## FASE F — Limpieza (UX-013 + legacy)
**Objetivo**: eliminar labels muertos y navegación muerta; endurecer sesión.
- **Archivos**: aliases LEGACY View (los no usados en bookmarks reales — medir antes de borrar), view-tips legacy, store purge on 401, `/login` redirect, viewIds duplicados (accounts_payable/accounts-payable → 1).
- **Riesgo**: Bajo si se mide uso real de aliases primero.
- **Aceptación**: (1) 0 labels duplicados en glosario; (2) sesión envejecida redirige a login; (3) ViewType sin duplicados.

## Orden y ventanas sugeridas
A (P0) → B → C → D∥ → E → F. Cada fase = gate independiente con evidencia en `audit-evidence/GATE1.5+…` y commit propio. Ninguna fase toca backend/RLS/permisos reales (Fase D solo nomenclatura de contrato de sesión).
