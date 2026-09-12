# REM-INV-2 — 10: INVENTORY + WAC (staging aislado)

Protocolo: determinar exactamente qué sucede al recibir `quantity / unit_cost / subtotal / tax / transport / other costs`; verificar `inventory / stock_movements / kardex / WAC / cost_average / cost_value`; esperado transición matemáticamente consistente `WAC_before ⊕ qty_received @ unit_cost = WAC_after` según la política canónica de CostPro (sin inventar fórmula distinta).

## 1. Qué tablas toca `receive_purchase` (definición verbatim)

| Tabla | Escritura | Campos |
|---|---|---|
| `inventory` | UPSERT | `quantity = quantity + r.quantity` (solo cantidad) |
| `stock_movements` | INSERT | `quantity_change`, `movement_type='purchase'`, `reference_id`, `created_at` — **sin `unit_cost`, sin `created_by`, sin `movement_date`** |
| `purchase_orders` | UPDATE | `status='received'`, `received_at` |
| `products` (`cost_average`/`cost_price`/`stock_current`) | **NINGUNA** | — |
| `kardex_entries` | **NINGUNA** | — |

## 2. Medición de staging — unit_cost=999 (deliberadamente absurdo)

Fixture: P1 con `cost_average=100`, `stock_current=5`; PO_WAC con item qty=10, unit_cost=999.

```text
products (P1): cost_average/stock_current before=(100, 5) after=(100, 5)   ← INMUTABLES
inventory.qty: 40 → 50 (+10)
stock_movements: [(10, 'purchase', 'PO_WAC…')]  ← fila SIN costo, SIN autor
```

**El `unit_cost=999` jamás fue leído**: la columna `unit_cost` de `purchase_items` no aparece ni una vez en el cuerpo de la función.

## 3. Veredicto del control

**FAIL — la V1 no produce transición de WAC.** No existe `WAC_after`: el costo promedio (política canónica de CostPro, `cost_average` + `fn_recalc_wac`) queda inmune a la recepción; la entrega llega al kardex como movimiento de cantidad pura, **sin atribución de costo** (rompe el kardex valorado: filas sin `unit_cost`) y sin autor. Además ignora por completo subtotal/tax/transport/other costs (el modelo `purchase_items` legacy ni siquiera tiene esas columnas).

## 4. Contraste con la canónica (misma política, no fórmula inventada)

`register_reception` y `confirm_pending_reception` computan `unit_cost_cup = unit_cost × tasa_cambio_recepcion`, base de conversión por variante (`conversion_factor`), y ejecutan `fn_recalc_wac(store, product, 'reception_in', units, unit_cost_cup, metadata)` con la doctrina **W62-01 §6: WAC primero → movimiento después (el kardex ve ca_new)**; el movimiento resultante lleva `unit_cost`, `created_by`, `movement_date`. Es exactamente la transición `WAC_before ⊕ (qty @ unit_cost_cup) = WAC_after` que el protocolo exige — la misma que F-03/REM-F4 congelaron como pipeline autoritativo y que este gate **no toca**.
