# GATE 1.4P — 02 NEWS BOARD (DECISIÓN 2)

Fecha: 2026-09-22 · Baseline: `7222b62d` · Método: código (NewsView, ManagementHubView, api/rss, useRSS, dexie), navegación (VIEW_TO_HUB_MAP, definición del hub, roles), datos reales (rss_feeds, rss_settings, store_notifications — solo lectura), arqueología Git (commits `b8c15082`, `8d7d9795`).

## 1. Qué es realmente el "Tablón de Noticias"

**El Tablón NO es un tablón de anuncios de CostPro ni de las tiendas: es un lector RSS de noticias económicas externas relevantes para MiPymes cubanas**, con detección y priorización de tasas de cambio del Banco Central de Cuba.

Componente: `src/components/views/terminal/views/rss/NewsView.tsx` (390 LOC).

| Aspecto | Evidencia |
|---|---|
| Fuente de datos | `GET /api/rss` (`src/app/api/rss/route.ts`): lee `rss_feeds` activos + `rss_settings`, parsea RSS server-side (`rss-parser`), cache 60 min, guard SSRF (`isSafeURL`, bloqueo IPs privadas) |
| Contenido típico | Feeds activos (tabla real, 8): Banco Central de Cuba, FMI, Banco Mundial (Esp), OMC, Cepal Comercio Exterior, CIAT Noticias Fiscales, BBC Mundo Economía, Granma (Cuba) |
| Categorías | 8 categorías temáticas MiPyme (`RSS_FEED_CATEGORIES`): economia_finanzas, comercio_exterior, tributacion_fiscal, regional_latam… (FIX-RSS-MIPYMES 2026-07-13) |
| Prioridad | Keywords en `rss_settings.priority_keywords` (real): "Tasas de cambio", "CUP", "Divisas", "ONAT", "Gaceta Oficial", "MiPyme", "Aranceles", "Importación", "Decreto"… |
| Tasas de cambio | Detección específica BCC (`bc.gob.cu`), regex `USD - 120.00` → tarjeta destacada de tasa (route.ts:87-105) |
| Filtros de UI | Búsqueda, prioridad, nacional/internacional (heurística por dominio `.cu`/cubadebate/juventudrebelde/gacetaoficial — FIX 2026-07-23, persistida en localStorage), categorías con contadores |
| Permisos API | `withAuth` — cualquier usuario autenticado; rate-limit por usuario |

## 2. Relación con tienda: NINGUNA

| Verificación | Resultado |
|---|---|
| `store_id` / `activeStoreId` en NewsView | **0 referencias** (grep) |
| `store_id` en `/api/rss` | No existe en el route (solo auth + rate-limit) |
| `store_id` en `rss_feeds`/`rss_settings` | Columnas: `id,name,url,category,is_active,is_special,created_at,updated_at` / `id,priority_keywords,…` — **sin store_id** |
| Tabla de noticias propia | **No existe** (`news`, `announcements`, `rss_items` → 404 en schema cache de PostgREST). El contenido vive en los feeds externos, no en una tabla de CostPro |
| ¿Puede una noticia pertenecer a una tienda? | **No** — no hay modelo para ello |
| ¿Hay noticias globales? | Todo el contenido ES global (feeds externos) |
| ¿Cambia con `activeStoreId`? | **NO** — mismo contenido para cualquier tienda activa |
| `store_notifications` (tabla candidata a "avisos por tienda") | Es un mecanismo técnico distinto: inserciones del reset de tienda (`/api/stores/reset:109-116`) con `store_id, user_id, is_read, title, message` — **sin lector UI encontrado** en src. NO es el Tablón ni alimenta al Tablón |

## 3. Ubicaciones actuales y permisos efectivos

| Superficie | Estado |
|---|---|
| Hub "Gestión de Tiendas" (`ManagementHubView.tsx`) | Tab 1 "Tablón Noticias" — **tab DEFAULT** (`useState<TabId>('news')`, línea 83); persistida en localStorage `mgmt-hub-tab` |
| Roles del TAB | `['admin','manager','encargado','clerk','usuario','warehouse']` — todos (línea 63) |
| Roles del ITEM sidebar `management-hub` | `['admin','manager','encargado']` (navigation-definition.ts:291) — **contradicción**: los roles operativos (clerk/usuario/warehouse) definidos como audiencia del Tablón hoy no pueden abrir el hub desde el sidebar |
| Deep-link `?view=news` | Aceptado (`VALID_VIEWS`, `TECHNICAL_VIEW_IDS`; guard default-open para vistas técnicas) |
| Breadcrumb | `VIEW_TO_HUB_MAP: news → { hubId: 'management-hub', leafLabel: 'Tablón de Noticias' }` — correcto |
| Móvil | Sin mapeo directo en MobileTabBar; acceso vía árbol (Más → Gestión de Tiendas) para roles de gestión |
| Administración de feeds | `rss_management` "Gestión RSS" — hoja visible del menú en SISTEMA, solo admin (`navigation-definition.ts:459-466`) |
| Otros lugares (widgets Inicio, dashboard, móvil) | **Ninguno** — grep de `useRSSNews` fuera de views/rss: 0 |

## 4. ¿Por qué es el tab DEFAULT de Gestión de Tiendas? (arqueología)

Commit `b8c15082` — 2026-07-12 — `feat(nav): unify Tablón Noticias + Vitrina + Tiendas into 'Gestión' hub`:

> "GESTION-UNIFICADA (2026-07-13): **el usuario pidió disminuir opciones del menú lateral izquierdo** unificando 3 vistas administrativas en un solo hub con tabs…"
> "EN ADMINISTRACIÓN: **ELIMINADO: 'Tablón Noticias' (id: news) como item directo. Ahora es tab 1 del hub de Gestión** en MULTI-TIENDA…"
> "Filtrado de tabs por rol: **news visible para todos**, storefront para admin/manager/encargado, stores solo para admin."

Conclusión histórica: el Tablón era un **item de primer nivel en la sección ADMINISTRACIÓN** y pasó a ser tab 1 del hub como **efecto mecánico de una limpieza de menú** (queda primero en el array `TABS` → default), no como decisión de pertenencia semántica a "Gestión de Tiendas". El commit de refinamiento posterior (`8d7d9795`, 2026-07-13) incluso describe el flujo ideal aterrizando en "Gestión Tiendas", evidencia de que el default 'news' nunca fue el centro del diseño del hub.

Evidencia adicional de desajuste actual: la descripción del item en la definición de navegación dice "Centro unificado: Tablón de Noticias, Vitrina pública y ciclo de vida completo de tiendas" — el Tablón se lista primero pero es el único de los tres que no gestiona tiendas.

## 5. Uso medible

`/api/rss` en `usage_aggregates` (solo lectura): **36+ requests con distribución recurrente** — 2026-08-04, 08-06, 08-07, 08-09, 08-10 (×2), 08-11 (×2), 08-17 (×2), 08-20, 08-21, 08-23 (×3), 08-24, 09-02, 09-03, 09-05, 09-09 (×2), 09-10, 09-21 (×2). Patrón de 1–2 llamadas diarias en días laborables con horarios variados — **el patrón de uso orgánico más fuerte de todas las capacidades auditadas en este gate** (comparado con los clusters de prueba de ofertas/customers/bank-reconciliation). Sin atribución por usuario (limitación de la tabla).

## 6. Prueba de modelo mental (respuestas por evidencia)

| Pregunta | Respuesta que la evidencia SOporta | Justificación |
|---|---|---|
| **A.** Si el usuario cambia de tienda activa, ¿debería cambiar el contenido del Tablón? | **NO** | El modelo no tiene store_id; el contenido no cambia hoy; cambiarlo requeriría inventar un modelo que no existe |
| **B.** Si un usuario no administra tiendas, ¿debería seguir pudiendo ver el Tablón? | La evidencia histórica dice **SÍ** (commit `b8c15082`: "news visible para todos"; roles del tab incluyen clerk/usuario/warehouse) | Hoy esa intención está rota por los roles del item del hub (§3) — el contenido es inteligencia de mercado relevante para cualquier rol |
| **C.** Si CostPro publica una noticia general, ¿debería aparecer igual para todas las tiendas? | **Sin modelo hoy** | No existe infraestructura de noticias propias (no hay tabla de announcements); lo único global hoy son feeds externos |
| **D.** Si un administrador publica un aviso exclusivo para TIENDA A, ¿debería verlo TIENDA B? | **Sin modelo hoy** | `store_notifications` existe pero es salida técnica del reset, insert-only, sin lector — no es una capability de avisos |

Respuestas A+B+C+D determinan: **el concepto del Tablón tal como está implementado es GLOBAL/TRANSVERSAL** (lectura de inteligencia de mercado). Las capacidades "avisos por tienda" y "comunicados de CostPro" **no existen** y, si Producto las quisiera, serían un producto nuevo (con candidatos técnicos ya presentes pero sin construir: `store_notifications` sin lector).

## 7. Tabla resumen exigida por el gate

| Evidencia | Resultado |
|---|---|
| Modelo de datos | 2 tablas de configuración (`rss_feeds` con 8 feeds activos reales, `rss_settings` con keywords reales). No hay tabla de noticias/avisos propios |
| Relación con tienda | Ninguna (0 columnas store_id, 0 referencias en UI/API) |
| Permisos | API: cualquier autenticado. UI: tab para todos los roles, pero item del hub restringido a admin/manager/encargado (contradicción) |
| Filtrado por tienda | No existe |
| Contenido global | 100% (feeds externos económicos/fiscales) |
| Contenido específico de tienda | No existe |
| Uso medible | SÍ — recurrente y orgánico (36+ req, ~7 semanas, sin atribución de usuario) |
| Ubicaciones actuales | Tab default del hub Gestión de Tiendas + admin "Gestión RSS" en SISTEMA; sin widgets en otros lugares |
| Intención histórica | Item de sidebar en ADMINISTRACIÓN hasta jul-2026; movido por petición de reducción de menú (b8c15082); "visible para todos" era la intención explícita |
| Modelo recomendado por evidencia | **GLOBAL / TRANSVERSAL (opción C — contextual/global no-menú es viable; el contenido NO pertenece al dominio Gestión de Tiendas)** |

## 8. Incertidumbres

1. El patrón de uso de `/api/rss` puede incluir tráfico de crawlers/sessions automatizadas del propio producto (no atribuible con la telemetría actual).
2. No hay registro de la conversación de producto que pidió "disminuir opciones del menú" — la intención de 2026-07-12 se reconstruye del mensaje de commit.
3. Si Producto quisiera "avisos por tienda" o "comunicados globales de CostPro", la ausencia de modelo es una brecha de producto nueva, no una reubicación del Tablón.
