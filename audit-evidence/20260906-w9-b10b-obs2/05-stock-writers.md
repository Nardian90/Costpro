# W9.5 — B-10b-OBS-2 · 05-stock-writers.md
# Arqueología completa de writers de `products.stock_current` (GATE 4)

Fuente: exploración exhaustiva del repo (migraciones `supabase/migrations/`, `src/**`,
`scripts/**`) ejecutada para esta fase. Metodología: búsqueda de `UPDATE products SET
stock_current`, `INSERT INTO products(... stock_current ...)`, `.update({ stock_current`,
triggers sobre `products`/`inventory`/`stock_movements`, y scripts de seed/restore/test.

## 1. Cadena CANONICAL (ledger → triggers → products)

| Writer | Mecanismo | Evidencia |
|---|---|---|
| `register_stock_movement` (9-param) | Solo INSERT en `stock_movements` + upsert `inventory`; products via trigger | `20260127_canonical_stock_movement.sql:20-82` |
| Trigger `sync_products_stock_current` | inventory AFTER ROW → `UPDATE products SET stock_current = NEW.quantity` | `20260113_consolidate_stock_source.sql:9-23`; redef con bypass restore en `20260802000008_v2_12_47_restore_rpc_execute.sql:34-51` |
| Trigger `sync_product_stock` | stock_movements AFTER ROW → products = último `balance_after` | `20260802000008:230-255` — **VERIFICADO VIVO en pg_trigger** |
| `register_stock_movement` (10-param) | INSERT ledger + `UPDATE products SET stock_current = v_new_qty` (absoluto) | `20260626000005_qa_batch2_rpc_fixes.sql:50-51` |
| `confirm_pending_reception` (PR-2) | NO toca stock_current; solo cost_average + INSERT movements | `20260810000020_pr2_migracion_b_schema.sql:130-140` |

## 2. Writers LEGACY (UPDATE directo — mayoría sustituidos; el "out" del reverse legacy ya congelado en B-10b)

- Familia `create_sale` V2.1→V2.11.3: `SET stock_current = stock_current - v_qty`
  (`20260707000001:103`, `20260712000007:77`, `20260712000008:69`, `20260726000026:68`,
  `20260726000030:77`) — documentados como bypass del ledger en
  `docs/audits/audit_v3_multi_store.md:184-191`.
- Recepciones: `confirm_pending_reception`/`void_reception_with_reversal`
  (`20260619000002:42`, `20260619000003:21`, `20260623000002:331,379-380`),
  `register_reception` V2.12.16 con **doble incremento** (27-jul-2026,
  `20260727000010:127-135`, corregido en `20260727000014`).
- Ajustes/conteos/devoluciones/reversas: `perform_inventory_adjustment`
  (`20260726000016:136`), megafix `20260727000006` (`apply_physical_count:90`,
  `confirm_inventory_adjustment:567`, `create_devolution:687`,
  `duplicate_inventory_adjustment:1021`, `receive_to_warehouse:1197`,
  `reverse_adjustment:1305`, `reverse_devolution:1352` con `GREATEST(0,…)`),
  `20260727000008` (13 writers), `reverse_*` (`20260726000005`, `20260726000007`,
  `20260905000002:216,397,475`), `reverse_receipt_v2` vigente
  (`20260902231200_w9_f45_h4:147-157`).
- Producción C-1 doble descuento (`20260712000005:148-179`, corregido
  `20260719000001..03`: "UPDATE directo + trigger → se modifica DOS VECES").

## 3. Writers RESET/SYNC (remediación masiva — críticos para este caso)

1. **`20260820000004_sync_products_stock_current.sql:22-32`** (migración-dato 08-20):
   `UPDATE products SET stock_current = COALESCE(inventory.quantity, 0)` GLOBAL.
   Su propio encabezado documenta que el **"reset del 2026-08-11"** dejó
   `stock_current=0` en 67 productos. **PROBARÁ que NO tocó d1c4ba0e**: los productos
   de la tienda tienen `updated_at ≤ 2026-08-16T22:01` (raw/g5), luego la migración no
   los actualizó (o corrió cuando stock==inventory ya coincidían y el WHERE no匹配ó).
2. `reconcile_stock(p_fix)` — reconstruye desde Σmovements con `GREATEST(0,…)`
   (`20260726000034:63-64`, anti-spoofing `20260727000013:131-132`).
3. Backfill `stock_current<0 → 0` + CHECK (`20260726000025:5`).
4. `reset_store_data` — ver 06-reset-analysis.md: **TODAS las versiones ponen
   stock_current=0 (keep_catalog=true) o DELETEAN products (false). NINGUNA deja
   stock>0.**

## 4. Writers IMPORT/SEED (stock SIN ledger — el patrón exacto de este hallazgo)

- **`DEMO_RESET_SCRIPT.sql:9,131-139`**: define `s1 = d1c4ba0e-…` = "TIENDA CENTRAL
  COSTPRO" e INSERTA productos **con `stock_current` 150/85** usando
  `session_replication_role='replica'` (**triggers OFF → sin inventory, sin
  movements, sin kardex, sin audit**). `DEMO_RESET_SCRIPT_V2.sql:186-199` añade 4 más
  (150/85/240/60). `V3` ya no inserta productos.
- `supabase/scripts/reset_demo_data*.sql` (104-126, 203-209, 136-149): mismos patrones.
- Clonado multi-tienda (`20260326_multi_tenant_hardening.sql:105`).
- Importador de catálogo API (`src/app/api/catalog/bulk-import/route.ts:133-151`):
  upsert por (sku,store_id) pero **sin stock_current** → NO puede inyectar stock.
- Precedente documentado: `docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md:97-127`
  (seed legacy con `created_at` idéntico en lote, inventory 1s después, movimientos
  retroactivos — saldos "claramente un valor externo").

## 5. Writers TEST (service_role contra la tienda real)

`scripts/seed_reverse_test_data.mjs:64-191`, `test_live_e2e_*.mjs`, `test_reverse_e2e_full.mjs`,
`test_duplicate_e2e_full.mjs:340`, `test_adjustments_e2e.mjs:27` — `.update({stock_current})`
/ `.insert({...stock_current:N})` directos, VARIOS apuntando a `d1c4ba0e-…`.
**Los 10 productos "…Test" del 2026-08-07 01:54-02:26 (126 u huérfanas) provienen de
estos scripts** (nombres: WAC Test Product, Tasa Extrema Test, Void WAC Test,
Concurrent Recv Test, WAC Trace Test, VOID Trace Test, WAC Fix Test, WAC Final Test,
WAC FINAL, PROD WAC Verify — ver 08-origin-analysis.csv).

## 6. RESTORE (mecanismos capaces de reescribir stock_current verbatim)

- RPC `restore_store_backup` (`20260802000008:708-737,749-755`): borra tablas activas
  del registry e INSERTA products desde el payload **incluido stock_current**, luego
  sincroniza desde inventory. Crea `restore_sessions` (auditable).
- API admin `restoreFromBackup` (`src/lib/backup/backup-service.ts:993-1061` + route
  `src/app/api/stores/[id]/backup/restore/route.ts:137-144`): upsert fila a fila con
  `select('*')` — restaura stock_current **verbatim**, sin movimientos, sin sesiones.
- **Para d1c4ba0e: 0 sesiones ejecutadas (solo 1 DRY_RUN) y 0 audit STORE_BACKUP_RESTORE
  después del 08-01 → el restore NO fue el mecanismo del estado actual.**

## 7. `has_movements` (flag)

Único writer: trigger `sync_product_has_movements()` sobre receipt_items /
transaction_items / inventory_movements AFTER ROW (`20260802000008:305-323`, bypass
restore_mode). La columna no se crea en ninguna migración del repo (añadida out-of-band).
Los 108 huérfanos tienen flag=true → EN ALGÚN MOMENTO existieron receipt_items/
transaction_items/inventory_movements para ellos (coherente con el ledger del backup
08-02: 242 movimientos), luego purgados.

## 8. Código de aplicación (src/)

**CERO writers de stock_current en src/** — todo el flujo pasa por RPCs canónicos
(`pos/checkout/route.ts:126`, `sync/batch/route.ts:148-166`, `inventory/adjust/route.ts:32`).

## Conclusión del GATE 4

El único mecanismo que produce EXACTAMENTE el patrón "products con stock + CERO
inventory/movements/kardex/transactions + timestamps externos" es **escritura directa
de filas bypassando triggers** (`session_replication_role='replica'` o SQL puro) —
patrón presente en DEMO_RESET_SCRIPT/seed scripts y en la restauración verbatim.
Ningún endpoint de aplicación ni RPC vigente puede producirlo.
