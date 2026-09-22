# FASE B — 01 NAVEGACIÓN ANTES (estado `7222b62d`)

Reconstrucción de la arquitectura real ANTES de la implementación (regla §3: no inventar la nueva IA).

## 1. Árbol de secciones (NAVIGATION_SECTIONS)

```
INICIO (fijo)          → dashboard
OPERACIÓN              → Vender (pos) · Ventas (sales-hub) · Almacén* · Logística* ·
                         Costo* · Trabajadores · Gestión de Tiendas (management-hub) · Redes*
ANÁLISIS               → Dashboard de Tiendas · Análisis de Fichas · Inteligencia Cambiaria ·
                         Reportes · Análisis ABC
SISTEMA (admin)        → Ajustes · Usuarios · Roles · Salud · Monitoreo · Auditoría ·
                         Gestión RSS · Cierre Fiscal
AYUDA                  → Centro de Ayuda · Wiki · Academia · Marco Legal
EN DESARROLLO (admin)  → IPV · Pick3 · Billetera
   (*) submenús con hojas propias
```

## 2. Estado ANTES de las 4 capacidades objetivo

### TABLÓN (`news` — NewsView, lector RSS)
| Superficie | ANTES |
|---|---|
| Sidebar | NO (es tab interna del hub `management-hub`) |
| Hub Gestión de Tiendas | **Tab 1 y DEFAULT** (`useState<TabId>('news')`; persistencia `mgmt-hub-tab`); roles del tab: TODOS |
| Item `management-hub` | roles `admin/manager/encargado`; descripción incluye "Tablón de Noticias"; **keywords incluyen `tablón`** (colisión de búsqueda con el destino real) |
| Palette | NO como destino propio; "tablón" resuelve hacia `management-hub` (pista indirecta) |
| Breadcrumb deep-link `?view=news` | `VIEW_TO_HUB_MAP: news → management-hub ("Tablón de Noticias")` — coherente con su ubicación ANTIGUA |
| `TECHNICAL_VIEW_IDS` / `TECHNICAL_DIRECT_ROUTES` | SÍ incluye `news` (vista técnica fuera de menú) |
| Móvil | Sin tab fijo; aparece solo dentro del hub (roles de gestión); roles operativos sin camino |
| Contradicción documentada (GATE 1.4P §3) | tab abierta a todos los roles vs item del hub solo admin/manager/encargado |

### OFERTAS (`ofertas` — OfertasView, 1.674 LOC + CRUD + PDF)
| Superficie | ANTES |
|---|---|
| Sidebar / Palette / Hub cards | **NADA** |
| Breadcrumb `?view=ofertas` | **"Módulo No Disponible"** (UX-002; no está en VIEW_TO_HUB_MAP ni en el árbol) |
| Disparadores reales | `StoreDashboardView.tsx:473` "Crear oferta" → `setCurrentView('ofertas')`; móvil `pos.activeViews` incluye `ofertas` |
| Relación con Cotizaciones | Coexisten; capacidades distintas (GATE 1.4P §2.5) |

### CLIENTES CRM (`customers` — CustomersView, Supabase)
| Superficie | ANTES |
|---|---|
| Sidebar / Palette / Hub cards | **NADA** |
| Breadcrumb `?view=customers` | **"Módulo No Disponible"** |
| Conflicto de id | `IPV_ROUTES['customers'] = { ipv, tab customers }` pisa la ruta directa en el master lookup (orden de spread); el id `customers` es tab interna de IPV |
| Fragmentación | CustomerCatalog IPV (Dexie, contextual) vs CustomersView (Supabase, global) sin resolución |

### CONCILIACIÓN BANCARIA (`bank-reconciliation` — 39 LOC esqueleto)
| Superficie | ANTES |
|---|---|
| Sidebar / Palette / Hub cards | **NADA** |
| Breadcrumb `?view=bank-reconciliation` | **"Módulo No Disponible"** |
| Estado real | Backend completo (import + RPC `auto_match_bank_items`); UI solo-lectura cuyo estado vacío remite al POST de API |

## 3. Pista falsa preexistente en palette (descubierta en la reconstrucción)

`SALES_HUB_PALETTE_ENTRIES` define `accounts-receivable` (id) con `route { view: 'accounts_receivable' }`.
`CommandPalette.handleSelect` resuelve `getNavigationRoute('accounts-receivable')` → direct, y
ejecuta `setCurrentView(action.route)` = `setCurrentView('accounts-receivable')` — id que NO es
ViewType ni case del shell → **"Módulo No Disponible"**. (El caso `accounts-payable` funciona
solo porque el shell acepta ambos guiones/underscore.) Se corrige en este gate como parte del
mandato palette (§9) con el patrón `route.view` para direct-routes.

## 4. Relación View → Hub (fuente actual)

- Hojas de menú: path derivado del árbol de definición (`findDefinitionPath`).
- Vistas contextuales: `VIEW_TO_HUB_MAP` (7 ventas + 3 inventario + 3 gestión + recepcion).
- Fallback: `[{ view}, 'Módulo No Disponible']` — alcanza a ofertas, customers, bank-reconciliation (y tabs IPV `customers`, fuera de alcance).
