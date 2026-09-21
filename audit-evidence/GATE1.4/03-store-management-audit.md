# GATE 1.4 — 03 STORE MANAGEMENT AUDIT (Gestión de Tiendas · Tablón · Vitrina · Dashboard de tienda activa)

Fecha: 2026-09-21 · Método: código (ManagementHubView.tsx, StoresManagementView, StorefrontConfigView, NewsView refs, contracts/user.ts, useSessionManager.ts) + navegador real.

## GATE 4 — GESTIÓN DE TIENDAS como dominio

El hub `management-hub` (sidebar OPERACIÓN) renderiza **3 tabs internas** (browser verificado, tab default = Tablón Noticias, persistido en localStorage `mgmt-hub-tab`):

| Tab | Componente | Qué es | Dominio conceptual correcto |
|---|---|---|---|
| TABLÓN NOTICIAS | NewsView | Agregador RSS de noticias (fiscales/contables/regulatorias), filtros TODOS/🇨🇺/🌍/temas, botón ACTUALIZAR | **Comunicación/información transversal** — NO es gestión de una tienda |
| VITRINA | StorefrontConfigView | Configuración del escaparate público de LA TIENDA ACTIVA (banner, carrusel, servicios, contacto, "Ver tienda", "Revalidar") | **Canal comercial / tienda** — relación directa con una tienda |
| GESTIÓN TIENDAS | StoresManagementView | CRUD de tiendas: "Nueva Sucursal", backup/restore, activar tienda de trabajo | **Administración de tiendas** — sí es el dominio |

### Tablón de Noticias — veredicto
- ¿Qué muestra? Noticias agregadas vía feeds configurados en `SISTEMA > Gestión RSS` (rss_management). Browser ✓.
- ¿Quién la usa? Todo rol con acceso al hub (admin/manager/encargado). Es lectura transversal, no operativa por tienda.
- ¿Relacionada con una tienda? NO — es información externa global del tenant.
- Clasificación: vista TRANSVERSAL. Estar como tab default de "Gestión de Tiendas" es **semánticamente dudoso** (DUDOSO): el nombre del hub promete gestión de tiendas y la primera pantalla es un lector de noticias sin relación con tiendas. Opciones (no implementar): (a) tab no-default dentro del hub, (b) vista independiente transversal, (c) herramienta global con acceso por palette/Inicio. La opción default-primero hoy fuerza a todo usuario de tiendas a pasar por noticias.
- NOTA: `news` también existe como vista standalone (`/?view=news` browser ✓, breadcrumb correcto "Inicio > OPERACIÓN > Gestión de Tiendas > Tablón de Noticias") — doble render del mismo NewsView (tab + vista directa), coherente.

### Vitrina — veredicto
- ¿Pertenece a Gestión de Tiendas? SÍ como **canal comercial de una tienda**, pero hoy tiene **DOS entradas con dos viewIds**: (1) tab "Vitrina" del hub (render StorefrontConfigView embebido); (2) vista directa `storefront-config` desde palette ("Vitrina Pública", ACTION_EXTENSIONS).
- Es el MISMO componente (`StorefrontConfigView`) — duplicación de ENTRADA, no de implementación (ver 11-duplication.md D-2).
- La entrada por palette sufre el defecto UX-002 (header/breadcrumb "Módulo No Disponible" — ver 09-deep-links.md).
- Recomendación (no implementar): un solo concepto — el hub mantiene la tarjeta/tab y la palette apunta al hub con tab preseleccionada (route { view:'management-hub', tab:'storefront' }) o se formaliza la vista standalone con breadcrumb propio. Hoy el estado es inconsistente.

### "Almacenes y Depósitos" (warehouses) — Misplacement detectado
`warehouses` (WarehousesView) tiene breadcrumb mapeado a `management-hub` ("Gestión de Tiendas > Almacenes y Depósitos", browser ✓) pero conceptualmente es **logística/almacén** (su familia natural: inventory/lots/history bajo Almacén). Evidencia de vaivén histórico: MOBILE_MAIN_TABS mapea `warehouses` al tab **Inventario** (línea 944) mientras el breadcrumb desktop lo cuelga de Gestión de Tiendas. Clasificación: MISPLACED (desktop) — dominio incorrecto en la vista principal.

## GATE 5 — DASHBOARD DE TIENDA ACTIVA

### Experiencia actual (browser verificado)
1. **Inicio (Tablero Consolidado, admin)**: cada tarjeta de tienda trae botones "Dashboard" (abre panel "Dashboard - {tienda}" con tabs RESUMEN/PRODUCTOS/COMPORTAMIENTO, KPIs 30d, Orden de Compra Inteligente, Insights) + "Configurar" + "Visitar tienda pública" + "Activar como tienda de trabajo" + "Dashboard KPI avanzado". **El dashboard de UNA tienda es accesible 1 clic desde Inicio SIN pasar por Gestión de Tiendas** — la propuesta "TIENDA ACTIVA → Dashboard" ya está resuelta en la home para admin (screenshot dashboard-store-btn.png).
2. **Gestión de Tiendas > Gestión Tiendas**: tarjetas de tiendas → dashboard por tienda (misma capacidad desde el segundo camino).
3. Clerk/encargado: `DashboardView` hace router por rol → `DashboardViewImpl` = tablero de SU tienda (comentario del código + navClass), es decir el dashboard de la tienda activa ES su Inicio.

### Fuente de verdad de tienda activa (código)
- DB: `profiles.active_store_id` (Supabase). Mapeo: `mapProfileToContract` → `UserContract.activeStoreId` (contracts/user.ts:75).
- Session: `useSessionManager` refresca perfil → auth store (status: `authenticated_valid` / `authenticated_no_store` / `authenticated_invalid_profile`).
- Existe legacy **`UserContract.storeId`** (@deprecated, de `profiles.store_id`, era single-store) — CONVIVE con activeStoreId (riesgo de divergencia documentado, UX-009; uso residual en hooks).
- `auth-middleware.ts:184`: `activateTenantRLS(userId, activeStoreId)` — RLS por tienda activa.
- No se encontró un segundo store de UI (zustand) con tienda activa propia: la fuente es la sesión → una sola verdad en cliente. Duplicación solo a nivel del campo legacy deprecado.

### Respuestas del mandato
- ¿Cómo se obtiene active_store_id? `profiles.active_store_id` → sesión → `user.activeStoreId` (frontend).
- ¿Fuente única? SÍ en runtime (session); legacy storeId deprecado convive (P3).
- ¿Sin tienda activa? Existe el estado `authenticated_no_store`; el flujo de dashboard muestra el consolidado y las tarjetas; POS bloquea venta con alerta "No tienes turno/No hay tienda" (alerta de turno verificada en POS). No se detectó crash ni pantalla rota.
- ¿Multi-tienda? El header tiene selector de tienda (StoreSelectorSheet móvil, dropdown header desktop "ENERVIDA-VITALLCONS"); palette incluye acciones "Cambiar a esta tienda" por cada tienda (browser ✓) — 2 canales de cambio de tienda (header + palette) + "Activar como tienda de trabajo" en cards (3º canal). Redundancia aceptable pero documentada.
- ¿Deep-link sigue válido? Sí: `/?view=dashboard` no depende de tienda; dashboards por tienda se abren por interacción (no URL) — no existe deep-link por tienda (gap menor, ver 09).
- Riesgo activeStore vs profiles.active_store_id: mismo dato; el riesgo real es el campo legacy storeId (P3) y stale session (UX-014).

## Conclusión
- Gestión de Tiendas como dominio: stores SÍ pertenece; Vitrina pertenece como canal de la tienda; Tablón NO pertenece naturalmente (transversal); Warehouses MISPLACED.
- Dashboard de tienda activa: YA accesible desde Inicio sin re-selección (propuesta del mandato implementada de facto en la home admin); para clerk es su Inicio. El único acceso redundante que queda es entrar por Gestión de Tiendas cuando ya hay tienda activa — útil para gestión multi-tienda, no obligatorio.
