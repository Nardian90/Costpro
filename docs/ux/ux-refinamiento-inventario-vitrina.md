# MÓDULO ESPECIAL — REFINAMIENTO UX/UI
## Inicio → Operación → Almacén / Inventario / Gestión de Tiendas

> **Objetivo**: Eliminar la saturación visual y convertir las vistas **Inventario** y **Gestión de Tiendas** en una experiencia moderna, limpia y con estándares profesionales internacionales — sin añadir botones solo porque la funcionalidad exista.

---

## PRINCIPIO RECTOR

```
Inventario          administra lo que EXISTE          → ¿Qué tengo?
Gestión de Tiendas  administra lo que el CLIENTE VE   → ¿Qué estoy mostrando al cliente?
Catálogo            muestra CÓMO lo verá el cliente   → ¿Cómo quiero que aparezca?
```

Cadena de relación: **INVENTARIO → CONFIGURACIÓN COMERCIAL → VITRINA**

---

## 1. AUDITORÍA — ARCHIVOS IDENTIFICADOS (línea base)

| Vista | Archivos principales |
|---|---|
| Inventario (contenedor) | `src/components/views/terminal/views/inventory/InventoryView.tsx` |
| Inventario — tarjetas (STOCK ACTUAL) | `src/components/views/terminal/views/inventory/InventoryCardView.tsx` |
| Inventario — tabla | `src/components/views/terminal/views/inventory/InventoryTableView.tsx` |
| Inventario — móvil | `src/components/views/terminal/views/inventory/InventoryMobileTable.tsx` |
| Kardex | `src/components/views/terminal/views/inventory/KardexModal.tsx` |
| Ajustar (movimiento de stock) | `src/components/views/terminal/views/inventory/InventoryAdjustmentModal.tsx` |
| ⋮ Menú de acciones existente | `src/components/ui/ProductActionsMenu.tsx` |
| Gestión de Tiendas | `src/components/views/terminal/views/stores/StoresManagementView.tsx` |
| Configuración de vitrina | `src/components/views/terminal/views/stores/StorefrontConfigView.tsx` + `StorefrontConfigPanel.tsx` |
| Catálogo (tiendas) | `src/components/views/terminal/views/stores/StoreCatalogView.tsx` |
| Catálogo (vista catálogo) | `src/components/views/terminal/views/catalog/CatalogView.tsx` + `CatalogProductGrid.tsx` + `EditProductModal.tsx` |
| Tipos de dominio | `src/types/index.ts` (banderas de visibilidad) |

### Banderas comerciales que gobiernan la vitrina (fuente única de verdad)
- `visibleEnTienda` (Visible en tienda)
- `precioVisible` (Precio visible)
- `stockVisible` (Stock visible)
- `promoción` (Sin promoción / en promoción)

**Regla crítica (nº 19-21)**: estas banderas NO son preferencias visuales — afectan directamente la vitrina. Deben persistir de verdad, con feedback inmediato, reflejo del estado real, sincronía entre Inventario y Gestión de Tiendas, y **una sola fuente de verdad**.

---

## 2. PLAN DE REFINAMIENTO (PROPÓN → IMPLEMENTA)

### FASE A — Inventario / STOCK ACTUAL (modo tarjeta)
- [ ] **A1**: Cada tarjeta = unidad independiente. Único punto de acciones: **menú ⋮**.
- [ ] **A2**: Clasificar acciones existentes (Ajustar, Editar, Kardex, Visible en tienda, Precio visible, Stock visible, Sin promoción…): las secundarias van al ⋮, agrupadas por relevancia. El menú no puede crecer sin límite.
- [ ] **A3**: Estado de vitrina visible de un vistazo con **badges/chips** (`● Visible en tienda`). Prohibido representar el mismo estado de varias formas (texto + botón + switch + icono = prohibido).
- [ ] **A4**: **Editar** ≠ **Ajustar**: Editar = información del producto (modal según complejidad); Ajustar = stock con movimiento trazable.
- [ ] **A5**: **Kardex** se abre desde la tarjeta con contexto del producto (sin re-navegar ni re-buscar).
- [ ] **A6**: Responsive: escritorio = grid de tarjetas; móvil = tarjeta compacta (nombre + ⋮ / Existencia / ● Visible / ● Precio). El ⋮ debe ser táctil, sin depender de hover.

### FASE B — Gestión de Tiendas = CONFIGURACIÓN DE LA VITRINA DIGITAL
- [ ] **B1**: Reposicionar la vista: no es "otra tabla de gestión", es la **configuración de la vitrina digital**.
- [ ] **B2**: Entrada clara y directa a la vista **Catálogo/Vitrina** (usando la terminología existente de COSTPRO).
- [ ] **B3**: La vista Catálogo gestiona la presentación por producto: Visible en tienda / Precio visible / Stock visible / Promoción.
- [ ] **B4**: Diseño de catálogo visual y elegante (NO una tabla de 4 columnas de switches).

### FASE C — Filtros inteligentes y operaciones
- [ ] **C1**: Filtros: Todos / Visible / Oculto / Precio visible / Precio oculto / Stock visible / Stock oculto / En promoción / Sin promoción (no todos a la vez; en móvil → panel plegable "Filtros").
- [ ] **C2**: Evaluar operaciones en lote (Visible / Precio / Stock / Ocultar) — solo si la arquitectura lo garantiza de forma segura.
- [ ] **C3**: Evaluar **Vista previa de la Vitrina** usando EXACTAMENTE las reglas existentes (sin crear una segunda lógica de catálogo).

### FASE D — Sincronía y persistencia (reglas 19-21)
- [ ] **D1**: Fuente única de verdad: cambiar "Visible en tienda = OFF" en cualquier extremo se refleja en el otro.
- [ ] **D2**: Flujo post-cambio: actualizar estado → persistir → actualizar vistas dependientes → feedback → manejo de errores → **rollback visual si falla**.
- [ ] **D3**: PROHIBIDO mostrar "Guardado" sin persistencia real.
- [ ] **D4**: Confirmación solo para acciones destructivas/irreversibles (eliminar producto, eliminar promoción, eliminación en lote). Los switches como "Precio visible" = inmediatos.

### FASE E — Consistencia y calidad
- [ ] **E1**: Misma tipografía / lenguaje / iconos / estados / colores semánticos / componentes / patrones de interacción entre Inventario y Catálogo — sin perder el propósito de cada vista.
- [ ] **E2**: Confirmación solo donde corresponde; cero botones redundantes; cero estados visuales falsos.

---

## 3. CRITERIOS DE ACEPTACIÓN (resumen de los 20)

1. Tarjetas limpias con acciones secundarias en ⋮
2. Editar y Ajustar claramente diferenciados
3. Kardex con contexto del producto
4. Estados de vitrina visibles de un vistazo (badges)
5. Gestión de Tiendas con entrada clara a Catálogo
6. Las 4 banderas claras y su efecto real en la vitrina
7. Fuente única de verdad entre vistas
8. Filtros inteligentes adecuados
9. Operaciones en lote y vista previa evaluadas
10. Móvil totalmente utilizable (⋮ táctil, sin hover)
11. Sin botones redundantes, sin estados falsos
12. Sin regresiones — Suite de pruebas en verde

## 4. BITÁCORA DE IMPLEMENTACIÓN

| Fecha | Fase | Cambio | Commit |
|---|---|---|---|
| 2026-10-08 | AUDITA | Línea base documentada; archivos identificados | (este commit) |

### Iteración 2 — Paridad móvil (§23/§24) · 2026-10-08

**Auditoría de estado real**: la fase A (tarjeta limpia + ⋮ + chips) y la fase B
(Catálogo/Vitrina en Gestión de Tiendas) ya estaban implementadas y mergeadas
en main (PR #1373, ciclo anterior). Re-auditoría de las 5 vistas detectó un
único gap restante:

- `InventoryMobileTable` mantenía el patrón antiguo: expansión de fila con
  4 icono-toggles ambiguos (Eye/EyeOff/Dólar/Package = estado Y acción a la
  vez, violación §6) y el estado de vitrina **invisible** en la fila
  colapsada (§24 exige "● Visible / ● Precio" visibles).

**Cambios (quirúrgicos, 4 archivos + 1 test):**

| Archivo | Cambio |
|---|---|
| `src/components/ui/StoreStatusChip.tsx` | NUEVO — chip compartido (desktop/móvil) con variante `compact` |
| `src/components/ui/ProductActionsMenu.tsx` | prop `triggerSize?: 'sm' \| 'lg'` → trigger táctil 44px (§23) |
| `.../inventory/InventoryCardView.tsx` | consume el chip compartido (sin cambio visual) |
| `.../inventory/InventoryMobileTable.tsx` | fila móvil: chips de estado visibles + ⋮ unificado; eliminados los 4 icono-toggles y la expansión |
| `src/__tests__/components/inventory-mobile-row.test.tsx` | NUEVO — 5 tests del contrato §23/§24 |

**Verificación:** 9/9 tests de inventario (móvil+desktop) · 23/23 archivos,
234 tests de componentes en verde · `tsc --noEmit` sin errores en archivos
tocado · eslint 0 errores.

**Criterios de aceptación cubiertos por esta iteración:** §6 (representación
única del estado), §23 (⋮ táctil ≥44px sin hover), §24 (fila móvil compacta:
nombre + ⋮ / Existencia / ● Visible / ● Precio), §E1 (un solo patrón de
interacción en las 3 superficies: tarjeta desktop, tabla desktop, fila móvil).
