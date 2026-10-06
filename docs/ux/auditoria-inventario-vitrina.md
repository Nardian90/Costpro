# Auditoría UX — Inventario (STOCK ACTUAL) + Gestión de Tiendas

**PR:** feat/ux-inventario-vitrina · **Fecha:** 2026-10-06
**Método:** AUDITA → PROPÓN → IMPLEMENTA → PRUEBA

---

## 1. Hallazgos — Inventario · STOCK ACTUAL (modo tarjeta)

Archivo: `src/components/views/terminal/views/inventory/InventoryCardView.tsx`
(+ `src/components/ui/atomic/index.tsx` `ProductCard` variante `inventory`)

### Controles visibles por tarjeta (ANTES) — 7 controles
| # | Control | Ubicación | Tipo |
|---|---------|-----------|------|
| 1 | Ajustar | dentro ProductCard | botón primario |
| 2 | Editar | dentro ProductCard | botón secundario |
| 3 | Kardex (icono) | fila bajo tarjeta | icono-toggle |
| 4 | Visible en tienda (Eye) | fila bajo tarjeta | icono-toggle |
| 5 | Precio visible ($) | fila bajo tarjeta | icono-toggle |
| 6 | Stock visible (Package) | fila bajo tarjeta | icono-toggle |
| 7 | Promoción (Tag) | fila bajo tarjeta | icono-toggle |

**Problemas detectados:**
- Saturación: 7 controles + badges (FC, Agotado, En mínimo, Stock Bajo) compiten por atención.
- La fila de 5 iconos-toggles bajo la tarjeta es ambigua (¿estado? ¿acción?) y no agrupa.
- La configuración de tienda (Visible/Precio/Stock/Promo) mezclada con acciones de producto (Kardex).
- Doble representación del estado: el icono ES a la vez switch y estado (violación §6 del brief).

### Clasificación de acciones (criterio del brief)
| Acción | Objeto | Frecuencia | Tipo | ¿Modifica datos? | ¿Afecta vitrina? | Decisión |
|--------|--------|-----------|------|------------------|------------------|----------|
| Ajustar | existencia/costo | diaria | primaria | sí (movimiento) | no | **visible en tarjeta** (botón primario) |
| Editar | datos del producto | media | secundaria | sí | indirecto | **⋮ → Editar producto** |
| Kardex | historial movimientos | media | secundaria | no (lectura) | no | **⋮ → Ver Kardex** |
| Visible en tienda | publicación | media | config tienda | sí | **directo** | **⋮ → Configuración de tienda** + chip estado |
| Precio visible | publicación | media | config tienda | sí | **directo** | **⋮ → Configuración de tienda** + chip estado |
| Stock visible | publicación | media | config tienda | sí | **directo** | **⋮ → Configuración de tienda** + chip estado |
| Promoción | publicación | baja | config tienda | sí | **directo** | **⋮ → Configuración de tienda** + chip (solo si activa) |

"Ver Kardex" y "Ver movimientos" son la misma operación (KardexModal = historial de movimientos) → un único ítem (evita duplicación §6).

## 2. Hallazgos — Gestión de Tiendas

Archivos: `ManagementHubView.tsx` (tabs: Tiendas | Vitrina), `StoresManagementView.tsx`,
`StorefrontConfigView.tsx`.

### Estado actual
- Tab **Tiendas** = ciclo de vida de tiendas (crear/editar/archivar/KPIs) — tabla administrativa.
- Tab **Vitrina** = `StorefrontConfigView` — configura marca/banner/plantillas/export de la tienda activa.
- **NO existe vista de catálogo por producto** en Gestión de Tiendas: la visibilidad comercial
  (visible_en_tienda, price_visible, stock_visible, on_promotion) solo se gestiona desde Inventario.

### Fuente única de verdad (verificada)
- DB: tabla `products` — campos `visible_en_tienda`, `price_visible`, `stock_visible`, `on_promotion`.
- Inventario escribe vía `supabase.update` + `queryClient.invalidateQueries(['products'],['inventory'])`.
- La vitrina pública (`src/app/tienda/[slug]/StorefrontPage.tsx`) LEE los mismos campos:
  - `price_visible === false` → muestra "Consultar"
  - `stock_visible !== false && !on_promotion` → muestra badge de stock
  - productos filtrados por `visible_en_tienda = true`
- **Conclusión:** la verdad ya es única a nivel DB; falta la superficie de gestión en Gestión de Tiendas
  y la sincronización visual inmediata entre ambas vistas (se logra compartiendo las mismas
  claves de invalidación).

## 3. Diseño propuesto

### 3.1 Tarjeta de Inventario (DESPUÉS)
```
┌──────────────────────────────┐
│ [badges: FC/Agotado/En mín] ⋮│
│  [imagen]                    │
│  CATEGORÍA                   │
│  CEMENTO P425                │
│  Código: 00125               │
│  ┌──────────┬──────────┐     │
│  │ Existencia│ Precio   │     │
│  │ 125.50    │ $12.500  │     │
│  └──────────┴──────────┘     │
│  ● Visible  ● Precio  ● Stock│  ← chips de estado (no switches)
│  [    AJUSTAR    ]  [⋮]      │  ← 1 acción primaria + menú
└──────────────────────────────┘
```
Menú ⋮ (Radix DropdownMenu — portal, táctil, teclado):
```
Editar producto
Ajustar stock
Ver Kardex
─────────────────────
CONFIGURACIÓN DE TIENDA
✓ Visible en tienda
✓ Precio visible
✓ Stock visible
✓ En promoción
```
Estados con spinner por-toggle (isToggling*) y deshabilitado durante la operación.

### 3.2 Tab nuevo "Catálogo" en Gestión de Tiendas
- Ruta conceptual: INVENTARIO (¿qué tengo?) → **CATÁLOGO (¿qué muestro?)** → VITRINA (¿cómo se ve?).
- Componente nuevo: `StoreCatalogView.tsx` (tab 3 del hub).
- Funcionalidades: búsqueda, filtros-chip (Todos/Visibles/Ocultos/Promo/Precio oculto/Stock oculto),
  contadores, tarjetas con los 4 estados + [Configurar] (popover toggles), acciones masivas
  con confirmación, vista previa con las reglas EXACTAS de StorefrontPage, "Ver tienda" en tab nueva.
- Escritura: mismos campos, mismo patrón (optimistic + revert on error + invalidación
  `['products']`/`['inventory']` + toast). Feedback inmediato; nunca "Guardado" falso.

## 4. Alcance de cambios (quirúrgico)

| Archivo | Cambio |
|---------|--------|
| `src/components/ui/ProductActionsMenu.tsx` | NUEVO — menú ⋮ reutilizable |
| `.../inventory/InventoryCardView.tsx` | tarjeta limpia + chips + ⋮ (elimina fila 5 toggles) |
| `.../stores/StoreCatalogView.tsx` | NUEVO — vista Catálogo |
| `.../management_hub/ManagementHubView.tsx` | tab `catalog` añadido |

**No se modifica:** ProductCard (usado por POS/Catálogo), InventoryTableView, InventoryMobileTable
(patrón tabla válido), modales existentes, handlers, rutas, autenticación, lógica de negocio, DB.
