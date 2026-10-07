# AUDITORÍA — Trazabilidad + Kardex por Producto

**Alcance**: `Inicio → Operación → Almacén → Inventario → Trazabilidad`
**Workflow**: AUDITA → PROPÓN → IMPLEMENTA → PRUEBA
**Prioridad**: Exactitud de inventario → Trazabilidad → Claridad → UX → Rendimiento → Accesibilidad

---

## 1. ESTADO ACTUAL (AUDITADO)

### 1.1 Ubicación de la vista

| Elemento | Valor |
|---|---|
| Componente | `src/components/views/terminal/views/stock_history/StockHistoryView.tsx` (312 líneas) |
| Registro de vista | `viewRegistry.ts` id `history`, route `/?view=history` |
| Navegación | `navigation-map.ts`: `history: { hubId: 'inventory', leafLabel: 'Trazabilidad (Movimientos de Stock)' }` |
| Hook de datos | `src/hooks/api/useStockMovements.ts` (tabla `stock_movements`, infinite scroll 50/pág) |

### 1.2 Cómo funciona hoy Trazabilidad

1. Al entrar **carga TODOS los movimientos de la tienda** (todos los productos), paginados
   con `useInfiniteQuery`, ordenados `created_at DESC`.
2. Filtro de texto **client-side** por nombre/SKU/referencia.
3. Filtro de fechas `from/to` (por defecto: inicio del mes actual → hoy).
4. Dos representaciones: tarjetas (default) y tabla.
5. Exportación CSV de los movimientos filtrados.

**Problemas detectados**:

- **P1 — Sin selección de producto**: es un listado global; no responde
  "¿Qué pasó con ESTE producto?".
- **P2 — Carga agresiva al entrar**: miles de movimientos antes de cualquier búsqueda.
- **P3 — Sin saldo inicial ni resumen del período** (§10, §23 del requisito).
- **P4 — Fuga de enums internos**: existen **3 mapeos duplicados** de `movement_type`
  (tarjeta, tabla, CSV), cada uno cubre solo `sale/purchase/adjustment`; cualquier otro
  tipo se imprime **crudo** al usuario (ej. `sale_reverse`, `devolution_in`).
- **P5 — Sin orden cronológico ascendente**: muestra DESC (más reciente primero), lo que
  impide leer el saldo corrido de forma natural.

### 1.3 Cómo funciona hoy Kardex

| Elemento | Valor |
|---|---|
| Componente | `src/components/views/terminal/views/inventory/KardexModal.tsx` (243 líneas) |
| Hook | `src/hooks/api/useKardex.ts` → RPC Supabase `get_product_stock_ledger_paginated` |
| Saldo corrido | **`balance_after` calculado server-side** (FIX H-12, iteración 11.1) — fuente única de verdad |
| Paginación | 25/pág, sin filtro de fechas |
| Diccionario | `MOVEMENT_INFO` local (18 tipos en español) con fallback `info.label = mt` (**fuga cruda**) |
| CSV | OTRO mapeo inline independiente (3 tipos, resto crudo) |

### 1.4 Tipos de movimiento REALES encontrados (fuente: `KardexModal.tsx` líneas 165-184)

```
sale, purchase, adjustment, return, initial, transfer, void,
devolution_in, transfer_in, transfer_out, out, production,
sale_reverse, purchase_reverse, sale_void, production_in, production_out
```
Más el flag transversal `reference_type === 'reversal'` (reversión contable V2.2).

### 1.5 Fuente de datos única

- Tabla **`stock_movements`**: `id, created_at, movement_type, quantity_change,
  balance_after, unit_cost, unit_price, reference_doc, reference_type, created_by,
  store_id, product_id` + join `products(name, sku)`.
- `balance_after` es **el saldo oficial después de cada movimiento** (calculado en BD).
- RLS por tienda: los hooks existentes filtran por `store_id` limpio (`getCleanStoreId`).
- Búsqueda de productos: RPCs existentes `get_products_for_pos` /
  `get_products_for_reception`; hook de debounce `useDebounce` disponible.

### 1.6 Accesibilidad de botones (hallazgos §35-37)

- `KardexModal`: botones de paginación con `label=""` e icono — **sin nombre accesible**.
- Mapeos duplicados = riesgo de warnings/etiquetas inconsistentes.
- El menú ⋮ del módulo anterior ya tiene patrón accesible (`aria-label`).

---

## 2. PLAN (PROPÓN)

### Principio arquitectónico

**UNA FUENTE DE VERDAD**: `stock_movements.balance_after` (server-side). Ni Trazabilidad
ni Kardex recalculan saldos; solo leen y ordenan. Sin segundo sistema de inventario,
sin duplicar movimientos, sin recalcular existencias.

```text
                 ┌── KardexModal (vista rápida, RPC paginada)
Ledger stock_movements
                 └── Trazabilidad (Kardex por producto, motor de período)
```

### F1 — Diccionario centralizado de presentación (obligatorio §14-18)

`src/lib/inventory/movementPresentation.ts`:

- `obtenerEtiquetaMovimiento(tipo)`: 18 tipos → etiqueta profesional en español
  (Venta, Compra, Ajuste, Devolución, Inicial, Transferencia, Anulación, Vale de salida,
  Reverso de venta, Reverso de recepción, …). **Fallback: `Otro`** — jamás imprimir el enum crudo.
- `obtenerClaseMovimiento(tipo)`: clases de color por categoría (entrada/salida/neutro/reverso).
- `obtenerIconoMovimiento(tipo)`: icono semántico.
- Un solo diccionario consumido por Trazabilidad, KardexModal y las exportaciones CSV.

### F2 — Motor de Kardex por producto con período (§9-13, §21-22)

`src/hooks/api/useProductKardex.ts` + helpers puros en
`src/lib/inventory/kardexPeriod.ts`:

- **Saldo inicial** = `balance_after` del último movimiento ANTES de `from`
  (si no existe: 0 — nada lo movió aún).
- **Movimientos del período** = consulta a `stock_movements` filtrada por
  `product_id + store_id + [from, to]`, orden ASC `created_at, id` (determinista),
  paginación por lotes de 1000.
- **Resumen**: entradas = Σ entradas del período; salidas = Σ salidas;
  **saldo final** = `balance_after` del último movimiento del período (o saldo inicial
  si el período está vacío). Nunca recalculado client-side.
- Testeable: `computePeriodSummary(movimientos, saldoInicial)` función pura.

### F3 — Trazabilidad en dos niveles (§3-8, §28-30)

Reescritura de `StockHistoryView.tsx`:

- **NIVEL 1 — Buscar producto**: buscador con debounce (código/nombre/descripción),
  ranking inteligente (exacto código → comienza código → contiene código → exacto nombre
  → comienza nombre → contiene nombre), lista de coincidencias (Código · Producto ·
  Existencia · Unidad), estados vacíos §29/§30. **Sin carga automática de movimientos**.
- **NIVEL 2 — Kardex del producto**:
  - Cabecera: Código, Producto, Unidad, Saldo actual + botón **Cambiar producto** (§28).
  - Filtro de período con opciones rápidas: Este mes · 7 días · Hoy · Mes anterior ·
    Este año · Personalizado (§9).
  - **Resumen del período**: Saldo inicial / Entradas / Salidas / Saldo final (§23).
  - Tabla Kardex: Fecha | Documento | Movimiento | Entrada | Salida | Saldo —
    cronológico ascendente (§21), saldo corrido de `balance_after` (§12).
  - Columna Documento: `reference_doc` visible; conserva trazabilidad documental (§19).
  - **Móvil** (§26): tarjetas de movimiento (fecha, tipo, documento, entrada/salida, saldo).
  - Exportación CSV del Kardex del producto respetando período (§32).
  - Estados vacíos: sin movimientos en el período (§29), sin coincidencias (§30).

### F4 — KardexModal alineado (§34)

- Sustituir `MOVEMENT_INFO` local y el mapeo inline del CSV por el diccionario compartido F1.
- `aria-label` en botones de paginación (§37).
- Mantiene su motor RPC (vista rápida paginada sobre el MISMO ledger).

### F5 — Nomenclatura y navegación

- La etiqueta de navegación `Trazabilidad (Movimientos de Stock)` se conserva
  (los tests `gate1-navigation` la esperan literal; ya contiene "Trazabilidad").
- Toda la UI nueva en español claro; los valores internos (`movement_type`) permanecen
  intactos en el código (§18: traducir solo en capa de presentación).

### F6 — Precisión y unidades (§40-42)

- Cantidades: `formatearCantidad()` que preserva decimales reales (65.5, 0.5, 10.125)
  sin redondeo; unidad del producto (`unit_of_measure`) visible junto a saldos.
- Precisión decimal vía números y `Intl.NumberFormat` con máximo de decimales real;
  se reutilizan utilidades existentes donde apliquen.

### F7 — Warnings de botones y accesibilidad (§35-38)

- Todos los botones nuevos: `type="button"` explícito (submit solo si envía formulario).
- Botones solo-icono: `aria-label` ("Cambiar producto", "Página anterior", …).
- Ejecutar lint + tests antes/después y comparar: objetivo REDUCIR warnings.

---

## 3. CRITERIOS DE ACEPTACIÓN

Ver checklist completo en la descripción del PR (28 ítems §44). Resumen crítico:

- [ ] Buscador por código y nombre con prioridad de coincidencia exacta
- [ ] Sin carga de movimientos hasta seleccionar producto
- [ ] Saldo inicial / corrido / final correctos y consistentes con `balance_after`
- [ ] Cronológico ascendente determinista
- [ ] Cero enums internos visibles ("SALE", "ENTRY", etc. jamás en UI)
- [ ] Kardex y Trazabilidad leen el mismo ledger (mismos saldos)
- [ ] Decimales y unidades preservados
- [ ] Móvil: tarjetas de movimiento
- [ ] Warnings de botones reducidos, no aumentados
- [ ] Pruebas de regresión ejecutadas
