# Backup Restore — Inventory Truth Model

**Fecha:** 2026-08-02
**Iteración:** 7 — Backup Restore
**Documento:** Modelo de verdad para datos de inventario
**Bloquea:** BR-2 (Restore RPC) hasta resolver

---

## Resumen Ejecutivo

El hallazgo crítico del audit previo (4 productos con `inventory.quantity` ≠ `SUM(stock_movements.quantity_change)` en Puerto Padre VITALLCONS) fue investigado en profundidad. Las causas raíz están identificadas y el modelo de verdad está definido.

**Conclusión principal:** El sistema opera con un **modelo híbrido A+B defectuoso** que debe normalizarse a **Modelo A (inventory = primary, stock_movements = audit)**. Hasta que esto se resuelva, BR-2 queda bloqueado.

---

## 1. Reporte detallado de discrepancias

### Metodología

Para cada uno de los 4 productos afectados, se consultaron vía PostgREST:

- `products` (sku, name, stock_current, created_at, updated_at)
- `inventory` (quantity, version, created_at, updated_at)
- `stock_movements` (todos los movimientos del producto en la tienda)
- `kardex_entries` (entradas de kardex)
- `inventory_adjustment_items` (ajustes manuales)
- `inventory_reservations` (reservas activas)
- `transfer_items` + `transfers` (transferencias que involucran el producto)

### Tabla resumen

| # | SKU | Nombre | inv.qty | SUM(mov) | diff | #movs | #kardex | #adj | dx |
|---|-----|--------|--------:|---------:|-----:|------:|--------:|-----:|----|
| 1 | PROD-022 | Té de 1/2 | **1051** | 52 | **999** | 2 | 0 | 0 | Inventario inicial sin movimiento |
| 2 | PROD-021 | Juegos de baño Importados | **1996** | -2 | **1998** | 4 | 0 | 0 | Inventario inicial sin movimiento |
| 3 | PROD-025 | Espejos | **106** | 3 | **103** | 2 | 0 | 0 | Inventario inicial sin movimiento |
| 4 | PROD-016 | Detergente Líquido | **999** | 0 | **999** | 10 | 0 | 0 | Compras cancelan ventas; inv=999 es saldo externo |

### Detalle por producto

#### Producto 1: PROD-022 (Té de 1/2) — diff = 999

```
product_id:    7c2d545f-627b-4815-97c3-20a88453302b
created_at:    2026-06-26T20:44:39   ← producto creado el 26 de junio
stock_current: 52.0                  ← coincide con SUM(movements)
inventory:
  quantity:    1051.0                ← NO coincide con stock_current (anómalo)
  version:     3
  created_at:  2026-06-26T20:44:40   ← 1 segundo después del producto
  updated_at:  2026-07-27T04:05:15

stock_movements (2):
  2026-05-01 09:00  purchase  +54   "Carga inicial"   ← FECHA ANTERIOR al producto!
  2026-05-28 12:00  sale      -2    "Venta 68cb2412"

SUM(movements) = +52
inventory.quantity = 1051
diferencia = 999
```

**Patrón**: El producto fue creado el 26-jun con `inventory.quantity = 1051` (carga externa). Posteriormente se insertaron 2 `stock_movements` con fechas retroactivas (1-may y 28-may) pero solo suman 52 unidades. Las 999 unidades de diferencia NO tienen movimiento asociado.

#### Producto 2: PROD-021 (Juegos de baño Importados) — diff = 1998

```
inventory.quantity = 1996
stock_movements = 4 (1 purchase +1, 3 sales -3)
SUM = -2
diferencia = 1998
```

**Patrón idéntico**. La "Carga inicial" fue solo +1 unidad, pero `inventory.quantity` quedó en 1996. Las 1996 unidades son saldo externo cargado directamente.

#### Producto 3: PROD-025 (Espejos) — diff = 103

```
inventory.quantity = 106
stock_movements = 2 (1 purchase +5, 1 sale -2)
SUM = +3
diferencia = 103
```

**Patrón idéntico**. La "Carga inicial" fue +5 unidades, pero `inventory.quantity` quedó en 106.

#### Producto 4: PROD-016 (Detergente Líquido) — diff = 999

```
inventory.quantity = 999
stock_movements = 10 (1 purchase +38, 9 sales -38)
SUM = 0   ← se cancelan exactamente!
diferencia = 999
```

**Patrón diferente pero mismo problema**: Los 10 movimientos se cancelan (compra 38, ventas suman 38). El saldo `inventory.quantity = 999` es claramente un valor externo, no derivado de los movimientos. El número 999 es sospechoso de ser un valor de testing/seed.

### Patrón común detectado

Los 4 productos comparten:

1. **`products.created_at` = 2026-06-26T20:44:39** (mismo timestamp, batch insert)
2. **`inventory.created_at` = 2026-06-26T20:44:40** (1 segundo después, trigger automático)
3. **`stock_movements[0].movement_date` = 2026-05-01** (un mes ANTES de la creación del producto)
4. **`kardex_entries` = 0** (el trigger `trg_auto_kardex` no generó entradas — confirma que los movimientos se insertaron después, fuera del flujo normal)
5. **`inventory_adjustment_items` = 0** (no se usaron ajustes formales)
6. **La "Carga inicial" en stock_movements tiene una cantidad pequeña** (1, 5, 38, 54) que no coincide con `inventory.quantity` (999, 106, 1996, 1051)

### Causa raíz identificada

**Script de seed/migración que cargó productos con `inventory.quantity` grande directamente, y por separado insertó `stock_movements` retroactivos con cantidades simbólicas.**

Esto es consistente con un script de demostración o migración de datos legacy que:

1. Hizo `INSERT INTO products (...)` con `stock_current = N` (valor legacy)
2. El trigger `trg_sync_products_stock_current` o un proceso posterior hizo `INSERT INTO inventory (quantity = N)` para crear la fila de inventario
3. Separadamente, un script de "movimientos históricos" insertó `stock_movements` con `movement_date` retroactivo (mayo 2026) pero solo con cantidades de demostración, no con el saldo real
4. Como los movimientos se insertaron fuera del flujo normal (sin pasar por `register_stock_movement`), el trigger `tr_sync_inventory_after_movement` no se disparó correctamente, o se disparó pero la carga ya estaba hecha

### Diagnóstico final

**El sistema NO tiene un modelo de verdad coherente hoy.** Opera como:

- **Para operaciones en vivo** (ventas, compras, transferencias vía RPC): `inventory.quantity` se actualiza por triggers desde `stock_movements`. Modelo B (derivado).
- **Para datos legacy/seed**: `inventory.quantity` se cargó directamente, `stock_movements` se insertó después con cantidades simbólicas. Modelo A (primary) + B (audit) mezclados.
- **Para `kardex_entries`**: el trigger `trg_auto_kardex` debería generar entradas desde `stock_movements`, pero los 4 productos tienen 0 entradas kardex. Esto confirma que las inserciones de `stock_movements` no pasaron por el flujo normal de triggers.

---

## 2. Modelo de verdad definitivo

### Decisión: **Modelo A — `inventory.quantity` es la fuente primaria**

Justificación:

1. **Es el saldo que el sistema muestra al usuario hoy** — consultar `products.stock_current` (que se sincroniza desde `inventory.quantity` vía trigger) devuelve el valor que el usuario ve y con el que opera.
2. **Es consistente con `products.stock_current`** — el trigger `trg_sync_products_stock_current` mantiene `products.stock_current = inventory.quantity`. Si restauramos `inventory`, `products.stock_current` se recalcula automáticamente.
3. **`stock_movements` es inherentemente incompleto** para datos legacy — el reporte demuestra que hay productos donde los movimientos no reflejan el saldo real.
4. **Reconstruir desde `stock_movements` destruiría los saldos legacy** — si hacemos `DELETE inventory; INSERT SUM(stock_movements)`, los 4 productos pasarían de 1051/1996/106/999 a 52/-2/3/0. Esto sería una **pérdida de datos catastrophic**.

### Clasificación source_of_truth (ya aplicada al registry)

| Tabla | source_of_truth | Razón |
|-------|-----------------|-------|
| `inventory` | **primary** | Saldo actual del producto en la tienda. Se restaura directo. |
| `products` | **primary** | Catálogo + `stock_current` (derivado pero autoritativo). Se restaura directo. |
| `product_lots` | **primary** | Lotes físicos reales con cantidades. Se restaura directo. |
| `warehouse_stock` | **primary** | Estado actual de stock en almacenes. Se restaura directo. |
| `inventory_reservations` | **primary** | Reservas activas (estado actual). Se restaura directo. |
| `stock_movements` | **audit** | Historial inmutable de movimientos. Se restaura directo, NO se usa para reconstruir `inventory`. |
| `kardex_entries` | **audit** | Historial inmutable del kardex. Se restaura directo, NO se usa para reconstruir `inventory`. |
| `inventory_adjustments` | **audit** | Historial de ajustes. Se restaura directo. |
| `inventory_adjustment_items` | **audit** | Items de ajustes. Se restaura directo (vía parent). |
| `inventory_snapshots` | **derived** | Calculado. Se respalda pero NO se restaura (se recalcula). |
| `inventory_batches` | **derived** | Calculado de `inventory` + `product_lots`. Se respalda pero NO se restaura. |
| `abc_classifications` | **derived** | Calculado por análisis ABC. Se respalda pero NO se restaura. |

### Implicaciones para el restore

#### Lo que el restore DEBE hacer:

1. Restaurar `inventory` directamente desde el backup (preserva el saldo legacy)
2. Restaurar `stock_movements` directamente desde el backup (preserva el historial, aunque sea incompleto)
3. Restaurar `kardex_entries` directamente desde el backup (preserva el kardex)
4. Restaurar `products` directamente desde el backup (preserva `stock_current`)
5. Después del restore, **verificar** que `inventory.quantity` coincide con el backup (no con `SUM(stock_movements)`)

#### Lo que el restore NO debe hacer:

1. **NO** hacer `DELETE inventory; INSERT SUM(stock_movements.quantity_change)` — destruiría saldos legacy
2. **NO** usar `stock_movements` como fuente para reconstruir `inventory`
3. **NO** usar `kardex_entries` como fuente para reconstruir `inventory`
4. **NO** recalcular `products.stock_current` desde `stock_movements` — se mantiene desde `inventory` vía trigger

#### Validación post-restore (actualización a `validate_post_restore`)

La función `validate_post_restore()` en Migration 3 debe verificar:

```sql
-- 1. inventory.quantity coincide con el backup (NO con SUM(stock_movements))
SELECT COUNT(*) INTO v_mismatches
FROM inventory i
WHERE i.store_id = p_store_id
  AND i.quantity != (p_backup_payload->'tables'->'inventory'->?(@.product_id == i.product_id)->>'quantity')::numeric;

IF v_mismatches > 0 THEN
  RAISE EXCEPTION 'Post-restore validation failed: % inventory rows do not match backup', v_mismatches;
END IF;

-- 2. products.stock_current coincide con inventory.quantity (trigger consistency)
SELECT COUNT(*) INTO v_trigger_failures
FROM products p
JOIN inventory i ON i.product_id = p.id AND i.store_id = p.store_id
WHERE p.store_id = p_store_id
  AND p.stock_current != i.quantity;

IF v_trigger_failures > 0 THEN
  RAISE EXCEPTION 'Trigger consistency failed: % products have stock_current != inventory.quantity', v_trigger_failures;
END IF;

-- 3. WARNING (no error) si inventory.quantity != SUM(stock_movements.quantity_change)
--    Esto es esperado para datos legacy, pero se reporta para transparency
SELECT COUNT(*) INTO v_legacy_discrepancies
FROM (
  SELECT i.product_id, i.quantity as inv_qty,
         COALESCE(SUM(sm.quantity_change), 0) as mov_sum
  FROM inventory i
  LEFT JOIN stock_movements sm ON sm.product_id = i.product_id AND sm.store_id = i.store_id
  WHERE i.store_id = p_store_id
  GROUP BY i.product_id, i.quantity
) t
WHERE inv_qty != mov_sum;

-- Esto es un warning, no un error
v_result := jsonb_set(v_result, '{checks,inventory_movements_discrepancies}',
                      to_jsonb(v_legacy_discrepancies));
```

---

## 3. Plan de remediación de datos legacy (fuera del scope de BR-2)

La discrepancia de los 4 productos NO se resuelve con el restore. Es un problema de **calidad de datos preexistente** que requiere una remediación separada:

### Opción A: Conservar el estado actual (recomendado para BR-2)

- Aceptar que `inventory.quantity` es la fuente de verdad
- Los 4 productos mantienen sus saldos (1051, 1996, 106, 999)
- `stock_movements` se conserva como historial incompleto
- Se documentan las discrepancias en `backup_table_registry.notes` o en un log aparte

### Opción B: Remediar los datos legacy (proyecto separado, post-BR-2)

Crear una migration separada (ej. `20260803000001_v2_12_46_inventory_legacy_fix.sql`) que:

1. **Identifique** todos los productos con discrepancia (no solo los 4):
   ```sql
   SELECT i.product_id, i.store_id, i.quantity as inv_qty,
          COALESCE(SUM(sm.quantity_change), 0) as mov_sum,
          i.quantity - COALESCE(SUM(sm.quantity_change), 0) as diff
   FROM inventory i
   LEFT JOIN stock_movements sm ON sm.product_id = i.product_id AND sm.store_id = i.store_id
   GROUP BY i.product_id, i.store_id, i.quantity
   HAVING i.quantity != COALESCE(SUM(sm.quantity_change), 0)
   ORDER BY diff DESC;
   ```

2. **Para cada producto con diff > 0** (saldo inicial sin movimiento):
   - Insertar un `stock_movement` de tipo `initial_balance` con `quantity_change = diff` y `movement_date = product.created_at`
   - Esto sincroniza el historial con el saldo sin modificar `inventory.quantity`
   - El trigger `tr_sync_inventory_after_movement` debe estar deshabilitado o bypass para no doble-contar

3. **Para productos con diff = 0** (como PROD-016):
   - Insertar un `stock_movement` de tipo `initial_balance` con `quantity_change = inventory.quantity`
   - Esto "explica" el saldo en el historial

4. **Generar `kardex_entries` faltantes** para los movimientos insertados

Esta remediación es **opcional** y **no bloquea** BR-2. El restore funcionará correctamente con los datos legacy tal como están.

---

## 4. Implicaciones para BR-2 (Restore RPC)

### Cambios en el diseño de BR-2

1. **`rebuild_inventory_balances()` ELIMINADO** del diseño original
   - NO se reconstruye `inventory` desde `stock_movements`
   - `inventory` se restaura directamente desde el backup

2. **`validate_post_restore()` ampliado** con las validaciones de la §2

3. **Bypass de triggers** (restore_mode) sigue siendo necesario para:
   - `trg_sync_products_stock_current` (inventory trigger) — para que no recalcula `stock_current` durante el restore
   - `tr_sync_inventory_after_movement` (stock_movements trigger) — para que no modifique `inventory` durante el restore
   - `trg_auto_kardex` (stock_movements trigger) — para que no genere kardex duplicados
   - `trg_update_product_wac` (receipt_items trigger) — para que no recalcula WAC

4. **El trigger `trg_sync_products_stock_current`** se mantiene activo al final del restore para asegurar que `products.stock_current = inventory.quantity`. Esto se logra con un `UPDATE products SET stock_current = inventory.quantity FROM inventory WHERE ...` explícito al final del restore.

### Orden de operaciones en `restore_store_backup()` (Migration 3)

```
1. SET LOCAL app.restore_mode = 'true'
2. Crear restore_session (status=EXECUTING)
3. Crear pre_restore_snapshot
4. DELETE store data (en orden inverso al topológico)
5. INSERT en orden topológico:
   - Tier 0: stores, categories, tax_configurations, ...
   - Tier 1: products (con stock_current del backup), ...
   - Tier 2: inventory (con quantity del backup), stock_movements (historial), ...
   - Tier 3-7: ...
6. UPDATE products SET stock_current = inventory.quantity FROM inventory
   WHERE products.id = inventory.product_id AND inventory.store_id = p_store_id;
7. validate_post_restore() — verifica inventory == backup, products.stock_current == inventory
8. UPDATE restore_session SET status = COMPLETED
9. COMMIT (implícito)
```

### Invariante post-restore

Después de un restore exitoso:

- ✅ `inventory.quantity` (restaurado) = `inventory.quantity` (backup)
- ✅ `products.stock_current` (recalculado por step 6) = `inventory.quantity` (restaurado)
- ⚠️ `SUM(stock_movements.quantity_change)` puede diferir de `inventory.quantity` para productos legacy — esto se reporta como warning, no como error

---

## 5. Próximos pasos

### Para desbloquear BR-2:

1. ✅ **Modelo de verdad definido** (este documento) — `inventory` = primary, `stock_movements` = audit
2. ✅ **Migration 1 actualizada** con `source_of_truth` column + invariantes validadas
3. ⏳ **Aplicar Migration 1** a Supabase (usuario debe hacerlo vía SQL Editor)
4. ⏳ **Ejecutar PT-1, PT-2, PT-3** (scripts/run_pt1_pt3.py)
5. ⏳ **Aprobación explícita del usuario** de este truth model

### Una vez aprobado:

6. Implementar **BR-2** (Migration 3: `restore_store_backup()` RPC + 4 trigger bypass + `validate_post_restore()` ampliado)
7. Ejecutar **PT-4** (restore en tienda vacía)
8. Ejecutar **PT-5** (restore destructivo controlado)
9. Ejecutar **PT-6** (prueba de desastre — restore falla a mitad, verificar rollback + snapshot)
10. Ejecutar **PT-7 a PT-10** (concurrencia)
11. Certificación final

### Lo que NO se hace en BR-2:

- ❌ Remediar los 4 productos legacy (eso es Opción B, proyecto separado post-BR-2)
- ❌ Sincronizar `stock_movements` con `inventory.quantity` para datos legacy
- ❌ Generar `kardex_entries` faltantes

---

## 6. Estado actual

```
BR-1 Registry              🟢 aprobado (con source_of_truth)
Backup service refactor    🟢 aprobado
PT-1/PT-2/PT-3             ⏳ pendiente ejecución (requiere migration aplicada)
Inventory truth model      🟢 definido (este documento) — pendiente aprobación usuario
BR-2 Restore RPC           🔒 bloqueado hasta aprobar truth model + PT-1/2/3
```
