# FASE B — 03 NAVEGACIÓN DESPUÉS

Estado DEspués de la implementación (6 archivos modificados, 337 inserciones / 36 eliminaciones).

## 1. TABLÓN — antes vs después

| Superficie | ANTES | DESPUÉS |
|---|---|---|
| Sidebar | Tab del hub Gestión de Tiendas | **Hoja "Tablón de Noticias" de la sección ANÁLISIS** (junto a Inteligencia Cambiaria) |
| Hub Gestión | Tab 1 DEFAULT | **Eliminada** — tabs: Gestión Tiendas (nuevo default) + Vitrina |
| Palette | Indirecta (keyword `tablón` del hub — pista falsa) | **Directa** (hoja con keywords `tablón/noticias/noticias económicas/información/rss/tasas de cambio/mercado/fiscal/gaceta`); keyword `tablón` retirada del hub |
| Breadcrumb `?view=news` | `Inicio > OPERACIÓN > Gestión de Tiendas > Tablón de Noticias` | `Inicio > ANÁLISIS > Tablón de Noticias` (derivado del árbol — VIEW_TO_HUB_MAP sin `news`) |
| Roles | Tab: todos; item del hub: admin/manager/encargado (contradicción) | Hoja `news`: todos (deep-link universal preservado); visibilidad de menú sigue el guard de sección (admin/manager/encargado); palette disponible para operativos. Contradicción reducida, documentada como B-adjunta |
| Móvil | Solo dentro del hub (roles de gestión) | **Sheet "Más" → grupo ANÁLISIS → Tablón de Noticias** (misma IA que desktop) |
| Listas técnicas | En TECHNICAL_VIEW_IDS y TECHNICAL_DIRECT_ROUTES | Fuera de ambas (es hoja de menú; fuente única = árbol de definición) |
| Nombre visible | "Tablón Noticias" / "Tablón de Noticias" | **"Tablón de Noticias"** (sin cambio de nombre, mandato §4) |
| Vista/componente | NewsView renderizada por TerminalShell | **Sin cambios** (cero duplicación) |

## 2. OFERTAS — antes vs después

| Superficie | ANTES | DESPUÉS |
|---|---|---|
| Hub Ventas | Sin tarjeta | **Tarjeta secundaria "Ofertas"** con copy honesto (documento formal, ITBIS, PDF) |
| Palette | Nada | **Acción "Ofertas"** (SALES_HUB_PALETTE_ENTRIES, `mobileHide`, roles del hub Ventas) |
| Breadcrumb | "Módulo No Disponible" | **`Inicio > OPERACIÓN > Ventas > Ofertas`** (VIEW_TO_HUB_MAP) |
| Sidebar | No | No (patrón Ventas: hub + palette — sin hoja de primer nivel) |
| Cotizaciones | Existente | **Intacta** (coexisten; semánticas distintas — GATE 1.4P §2.5) |
| Disparador dashboard | "Crear oferta" | Intacto |
| Móvil | pos.activeViews | Intacto + palette |
| Lógica/UI/API de Ofertas | — | **Sin cambios** (solo navegación) |

## 3. CLIENTES CRM — antes vs después

| Superficie | ANTES | DESPUÉS |
|---|---|---|
| Destino canónico | Ninguno (huérfana) | **CustomersView (Supabase) bajo Ventas** — único destino global |
| Hub Ventas | Sin tarjeta | **Tarjeta secundaria "Clientes"** con copy honesto (alta + búsqueda; sin prometer CRUD completo) |
| Palette | Nada | **Acción id `clientes` → view `customers`** (evita pisar `IPV_ROUTES['customers']`; sin tercera implementación) |
| Breadcrumb | "Módulo No Disponible" | **`Inicio > OPERACIÓN > Ventas > Clientes`** (VIEW_TO_HUB_MAP['customers']) |
| IPV CustomerCatalog (Dexie) | Contextual | **Intacto** (permanece contextual en EN DESARROLLO; su tab `customers` conserva su ruta técnica) |
| Móvil | Sin mapeo | `pos.activeViews` + `customers` (cluster Vender, igual que quotations/ofertas) |
| Consolidación CRM | — | **Deuda documentada** (fuera de alcance FASE B — mandato §6) |

## 4. CONCILIACIÓN BANCARIA — antes vs después

| Superficie | ANTES | DESPUÉS |
|---|---|---|
| Sidebar / Palette / Hub | Nada | **Sigue fuera** (decisión: capacidad parcial no se promueve — no aparentar completa) |
| Breadcrumb deep-link | "Módulo No Disponible" | **Rama standalone "Conciliación Bancaria"** (sin hub ficticio; convención del shell para vistas standalone: con 1 ítem no se renderiza barra — precedente `calculator`/`chat`; nada falso en pantalla) |
| Deep-link | Funciona | Funciona (VALID_VIEWS + case del shell intactos) |
| Vista/API/DB | — | **Sin cambios** |

## 5. Command Palette — corrección de dispatch

`CommandPalette.handleSelect` despachaba el id crudo de la acción en direct-routes. Ahora
despacha `route.view` (el ViewType canónico). Efecto:
- Corrige la pista falsa **preexistente** de `accounts-receivable` (id ≠ view → "Módulo No
  Disponible"); verificado en navegador: "cobros" aterriza en Cobros por Antigüedad.
- Habilita la entrada `clientes` (id ≠ view `customers`).
- Los ids que YA son ViewType (`news`, `ofertas`, `pos`, …) despachan idéntico (route.view === id).

## 6. Fuente única View → Hub (mandato §8)

| Origen | Vista | Mecanismo |
|---|---|---|
| Árbol de definición | news (y todas las hojas de menú) | `findDefinitionPath` — el mapa de hubs ya NO duplica `news` |
| Mapa de contextuales | ofertas, customers (+ las 13 previas) | `VIEW_TO_HUB_MAP` — única entrada por vista |
| Ramas explícitas | dashboard/occ, calculator, chat, **bank-reconciliation** | standalone en `getBreadcrumbForView` |

Cero mapas duplicados; las 4 capacidades objetivo sin "Módulo No Disponible".

## 7. Dif por archivo

| Archivo | Cambio |
|---|---|
| `navigation-definition.ts` | +hoja news en ANÁLISIS (con roles históricos del tab), descripción ANÁLISIS, management-hub sin 'tablón', +extensiones ofertas/clientes, +customers en pos.activeViews, news fuera de TECHNICAL_VIEW_IDS |
| `navigation-map.ts` | VIEW_TO_HUB_MAP: +ofertas, +customers, −news; TECHNICAL_DIRECT_ROUTES: −news; rama standalone bank-reconciliation |
| `ManagementHubView.tsx` | −tab news, −import NewsView; tabs [Gestión Tiendas (default), Vitrina]; comentario FASE B |
| `SalesHubView.tsx` | +tarjetas Ofertas y Clientes (copys honestos), +imports Megaphone/Users |
| `CommandPalette.tsx` | dispatch direct-route por `route.view` |
| `gate1-navigation.test.ts` | +5 describe / 19 contratos FASE B; imports NAVIGATION_MAP/TECHNICAL_VIEW_IDS |
