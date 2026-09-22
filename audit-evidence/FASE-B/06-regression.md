# FASE B — 06 REGRESIÓN (mandato §16)

## 1. Superficies verificadas

| Superficie | Verificación | Resultado |
|---|---|---|
| **Gestión de Tiendas** | Hub abre con default "Gestión Tiendas" (nuevo default), tab Vitrina intacta, sin tab Tablón; tarjeta "Ver Dashboard" por tienda intacta (StoreDashboardView untouched) | ✓ Desktop 1440/1280/1024 + móvil 390/375 |
| **Dashboard (Inicio)** | Carga con contenido real, sin módulo falso; sigue siendo hoja de ANÁLISIS en sidebar ("Dashboard de Tiendas") — su pertenencia no cambió | ✓ |
| **Navegación desktop** | Sidebar focus-mode: secciones y hojas derivadas; OPERACIÓN/ANÁLISIS navegan; hojas previas intactas (Vender, Ventas, Almacén, Costo, Trabajadores, Redes, Reportes, ABC…) | ✓ Suite + navegador |
| **Navegación móvil** | 4 tabs fijos + sheet "Más" derivado; pos.activeViews ampliado solo con `customers`; extensiones Ventas siguen `mobileHide` | ✓ Suite + navegador |
| **Command palette** | 2.200 tests incluyen contratos por rol; "caja" resuelve UNA acción; admin/clerk ven lo que deben; nuevo dispatch `route.view` corrige (no rompe) los despachos existentes — ids=ViewType despachan idéntico | ✓ |
| **Breadcrumbs** | Contratos GATE 1.4R/1.4R.1 del módulo Costo íntegros (130 tests de navegación); sales → Historial verificado en navegador; VIEW_TO_HUB_MAP solo creció (ofertas/customers) y retiró news (fuente única) | ✓ |
| **Permisos** | Cero cambios: roles de secciones/hojas/extensiones preservados; `news` conserva los roles del tab histórico (deep-link universal); el guard de ANÁLISIS sigue gobernando la visibilidad del menú; SISTEMA/EN DESARROLLO sin cambios (tests "clerk no ve admin" en verde) | ✓ |
| **Active store** | Sin tocar: NewsView no depende de tienda (GATE 1.4P); store switcher, NoStoreGuard, monitors intactos (0 diffs fuera de los 6 archivos) | ✓ |
| **Sesión** | Login real usado en todas las verificaciones; logout/perfil intactos | ✓ |
| **Vistas existentes** | Historial de Ventas (breadcrumb + render), Cotizaciones (tarjeta presente), Vitrina (extensión intacta), IPV (`IPV_ROUTES['customers']` sin pisar — test explícito), Costo (contratos 1.4R.1 completos) | ✓ |
| **Base de datos / RLS / APIs** | **Cero cambios** (diff: 6 archivos de navegación/UI + test; sin migraciones, sin server actions, sin rutas API) | ✓ |

## 2. Guardas estructurales que siguen en pie (suite verde)

- Cero destinos muertos por construcción (`assertNavigationIntegrity` + tests de integridad).
- Sin duplicación de IDs entre hojas/extensiones (test).
- Sidebar/Palette/Móvil derivan de la única definición (tests de derivación).
- Contratos anti-duplicación de GATE 1.4R/1.4R.1 (Arena FC no es hoja; modos/acciones no son vistas).
- Home única (`occ → dashboard`).
- Contrato ViewId (sin `[object Object]`).

## 3. Cambios de comportamiento visibles (intencionales, por decisión de producto)

1. El Tablón aparece como hoja de ANÁLISIS (sidebar desktop + sheet móvil) y ya no como tab
   del hub Gestión — es EL objetivo de la fase (UX-005).
2. El hub Gestión aterriza en "Gestión Tiendas" (identidad del hub) en lugar del Tablón.
3. Valores antiguos `mgmt-hub-tab: 'news'` en localStorage degradan gracia al default
   (`TABS.some` guard) — sin error.
4. "Ofertas" y "Clientes" aparecen como tarjeta + palette del hub Ventas.
5. "Cobros por Antigüedad" (palette) ahora aterriza en su vista real — antes lo hacía en
   "Módulo No Disponible" (pista falsa preexistente corregida).

Ningún flujo de negocio, cálculo, dato o permiso cambió.
