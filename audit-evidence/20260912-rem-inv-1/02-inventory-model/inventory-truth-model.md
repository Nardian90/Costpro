# REM-INV-1 — 02 Inventory Truth Model (verificado contra catálogo live 2026-09-12)

## Modelo efectivo (demostrado por triggers live, no asumido)

```text
stock_movements (INSERT — única entrada legítima de stock)
  ├─ BEFORE: fn_sync_inventory_on_movement (tr_sync_inventory_after_movement)
  │    · valida producto existe + movement.store_id == products.store_id (FIX H-01)
  │    · upsert inventory.quantity += quantity_change (version++), bloquea resultado < 0
  │    · set NEW.balance_after (post-movimiento)
  ├─ AFTER: auto_kardex_on_stock_movement (trg_auto_kardex)
  │    · 1:1 kardex_entries por movimiento (reference_type='stock_movement')
  │    · balance_quantity/balance_unit_cost/balance_total_value leídos de products
  │      ANTES de que sync_product_stock aplique el movimiento → PRE-IMAGE (F-05)
  └─ AFTER: sync_product_stock (trg_sync_product_stock)
       · products.stock_current = último balance_after (por movement_date, created_at)

inventory (caché derivada, protegida)
  └─ trigger_prevent_inventory_update → prevent_direct_inventory_modification:
     bloquea UPDATE directo (ERR_DIRECT_INVENTORY_MODIFICATION) salvo
     pg_trigger_depth()>1 o app.restore_mode (bypass documentado para restore)
  └─ trg_prevent_negative_inventory: bloquea quantity < 0
  └─ trg_sync_products_stock_current: products.stock_current = inventory.quantity

products.cost_average (WAC — escritor único)
  └─ trg_guard_wac_writer → w62_guard_wac_writer:
     ERR_WAC_SINGLE_WRITER_VIOLATION salvo token de sesión app.wac_writer='fn_recalc_wac'
```

## Ecuación de existencia (Fase 2 — qué entra en cada componente)

`STOCK_FINAL = Σ stock_movements.quantity_change` por (store, product), con componentes:
- ENTRADAS: `purchase`, `initial`, `return` (devolución de venta), `transfer_in`, `production_in`
- SALIDAS: `sale`, `transfer_out`, `production_out`, `devolution_reverse`
- REVERSIONES: `purchase_reverse`, `sale_reverse`, `production_reverse` (compensatorios)
- AJUSTES: `adjustment` (vía perform/confirm_inventory_adjustment)

Fuente de verdad: **stock_movements es el ledger primario; inventory es caché derivada e inmutable; products.stock_current doble-escritura convergente (último balance_after == inventory.quantity — verificado 0 divergencias)**. Nota: difiere del "Modelo A" de docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md (2026-08-02): desde entonces el sistema endureció inventory como DERIVADA con guard — el truth model vigente es ledger-first. La divergencia legacy de 4 productos (999/1998/103/999) ya NO existe (r01: 0 filas divergentes en todo el dataset).

## Conclusión central

`inventory.quantity == SUM(stock_movements.quantity_change)` se cumple en **el 100% del dataset live (277 filas inventory / 1,021 movimientos)** y `products.stock_current == inventory.quantity` en el 100% (367 productos). Paridad kardex↔movimientos 1:1 exacta (r07 vacío). El modelo es matemáticamente consistente hoy; los defectos residuales son de VALOR (costos) y TRAZABILIDAD (referencias), no de CANTIDAD (ver 14-findings).
