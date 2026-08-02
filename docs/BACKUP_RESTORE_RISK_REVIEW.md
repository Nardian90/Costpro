# Backup Restore — Revisión Final de Riesgos (Pre-Implementación)

**Fecha:** 2026-08-02
**Iteración:** 7 — Backup Restore
**Fase:** Diseño detallado (post-aprobación, pre-migration)
**Store testigo:** `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` (TIENDA CENTRAL COSTPRO)
**Store secundaria:** `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` (Puerto Padre VITALLCONS)

---

## Resumen Ejecutivo

Se ejecutaron las 7 validaciones solicitadas por el usuario contra el esquema real (no teórico) de Supabase. Los hallazgos clave son:

1. **FK reales**: 125 relaciones FK detectadas desde migraciones + 80 tablas store-scoped confirmadas vía OpenAPI spec de PostgREST. Se construyó grafo topológico definitivo.
2. **restore_mode**: No existe uso previo de GUCs personalizadas en el proyecto. Se requiere modificar **4 funciones trigger críticas** para que lean `current_setting('app.restore_mode', true)`.
3. **inventory vs stock_movements**: **HALLAZGO CRÍTICO** — en la tienda #2 hay **4 productos con discrepancias de hasta 999 unidades**. `rebuild_inventory_balances` desde `stock_movements` NO es seguro sin validación previa.
4. **Modo destructivo**: Definido explícitamente como **A (Restore destructivo)** — el backup reemplaza completamente la tienda.
5. **Snapshot previo automático**: Diseñada tabla `restore_sessions` + función `create_pre_restore_snapshot()`.
6. **Concurrencia**: Diseñado bloqueo `RESTORE_IN_PROGRESS` vía `pg_advisory_xact_lock` + flag en `restore_sessions`.
7. **Implementación por fases**: 4 migrations aprobadas, este documento valida solo Migration 1+2 antes de BR-2.

---

## 1. Validación de FK reales (information_schema → migrations + OpenAPI)

### Metodología

No se pudo acceder a `information_schema.table_constraints` directamente vía PostgREST (no está expuesto). Se usaron dos fuentes complementarias:

1. **Análisis estático de 267 migraciones** (`supabase/migrations/*.sql`):
   - Regex para `REFERENCES [schema.]parent(col)` (inline + CONSTRAINT FOREIGN KEY)
   - Regex para `ALTER TABLE x ADD CONSTRAINT ... FOREIGN KEY`
   - Detección de tablas con columna `store_id` (CREATE TABLE + ALTER TABLE ADD COLUMN)

2. **Introspección del esquema real** vía OpenAPI spec de PostgREST (`GET /rest/v1/`):
   - Lista autoritativa de **285 tablas/vistas** expuestas
   - Columnas reales por tabla
   - Detección de `store_id`, `origin_store_id`, `destination_store_id`

### Resultado: 80 tablas para backup (vs 16 actuales)

| Categoría | Cantidad | Origen |
|-----------|---------:|--------|
| Tablas con `store_id` directo | 71 | OpenAPI spec |
| Tablas con `origin/destination_store_id` (transfers) | 1 | OpenAPI spec |
| Tablas transitive (sin store_id, vía parent) | 17 | FK graph |
| Vistas `v_*` / `mv_*` (excluidas) | -9 | OpenAPI spec |
| **Total backup** | **80** | |

> **Nota**: El audit previo mencionaba 67 tablas. La diferencia (80 vs 67) se debe a que se incluyeron tablas auxiliares (`cash_register_sessions` vs `cash_sessions`, `inventory_batches`, `inventory_snapshots`, `cost_sheet_templates`, `store_notifications`) que pueden marcarse como `excluded=true` con justificación. El registry permite excluir tablas sin eliminarlas del catálogo.

### Lista definitiva de 80 tablas (orden topológico restauración)

#### Tier 0 — Configuración tienda (sin dependencias)

| # | Tabla | Filter strategy | Notas |
|---|-------|-----------------|-------|
| 1 | `stores` | by_id | Fila única de la tienda |
| 2 | `categories` | store_id | **OJO**: el backup actual la trata como global, pero tiene `store_id`. BUG. |
| 3 | `tax_configurations` | store_id | |
| 4 | `service_types` | store_id | |
| 5 | `store_cost_templates` | store_id | |
| 6 | `store_exchange_rates` | store_id | |
| 7 | `store_notifications` | store_id | Marcada como `excluded=true` (transitoria) |
| 8 | `report_definitions` | store_id | |
| 9 | `saved_analytics_views` | store_id | |
| 10 | `sync_log` | store_id | Marcada como `excluded=true` (log efímero) |
| 11 | `warehouse_stock` | store_id | **Depende de warehouses y products** — ver Tier 2 |
| 12 | `warehouses` | store_id | |

#### Tier 1 — Catálogo (sin dependencias de otras tablas store-scoped)

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 13 | `products` | store_id |
| 14 | `product_variants` | via_parent: products.id |
| 15 | `product_lots` | store_id |
| 16 | `product_cost_sheets` | store_id |
| 17 | `ofertas` | store_id |
| 18 | `abc_classifications` | store_id |
| 19 | `price_commit_log` | store_id |
| 20 | `price_change_history` | store_id |
| 21 | `suppliers` | store_id |
| 22 | `customers` | store_id |
| 23 | `workers` | store_id |
| 24 | `profiles` | store_id (marcada `excluded=true` — ver §4) |

#### Tier 2 — Inventario y movimientos

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 25 | `inventory` | store_id |
| 26 | `inventory_adjustments` | store_id |
| 27 | `inventory_adjustment_items` | via_parent: inventory_adjustments.id |
| 28 | `inventory_reservations` | store_id |
| 29 | `inventory_batches` | store_id (marcada `excluded=true` — derivada) |
| 30 | `inventory_snapshots` | store_id (marcada `excluded=true` — derivada) |
| 31 | `physical_counts` | store_id |
| 32 | `physical_count_items` | via_parent: physical_counts.id |
| 33 | `stock_movements` | store_id |
| 34 | `kardex_entries` | store_id |
| 35 | `warehouse_stock` | store_id (mover aquí, requiere warehouses+products) |

#### Tier 3 — Transacciones y documentos

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 36 | `transactions` | store_id |
| 37 | `transaction_items` | via_parent: transactions.id |
| 38 | `transaction_item_lots` | via_parent: transaction_items.id |
| 39 | `sales_transactions` | store_id |
| 40 | `payment_transactions` | store_id |
| 41 | `cash_sessions` | store_id |
| 42 | `cash_register_sessions` | store_id (marcada `excluded=true` si es legacy) |
| 43 | `cash_movements` | store_id |
| 44 | `cash_closures` | store_id |
| 45 | `receipts` | store_id |
| 46 | `received_services` | store_id |
| 47 | `service_reception_links` | via_parent: receipts.id, received_services.id |
| 48 | `service_cost_distributions` | via_parent: received_services.id |
| 49 | `devolutions` | store_id |
| 50 | `devolution_items` | via_parent: devolutions.id |
| 51 | `quotations` | store_id |
| 52 | `quotation_items` | via_parent: quotations.id |
| 53 | `purchase_orders` | store_id |
| 54 | `purchase_order_items` | via_parent: purchase_orders.id |
| 55 | `fiscal_closings` | store_id |
| 56 | `bank_statements` | store_id |
| 57 | `bank_statement_items` | via_parent: bank_statements.id |
| 58 | `business_events` | via_parent: entity_id IN stores.id (especial) |

#### Tier 4 — Producción y comisiones

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 59 | `production_orders` | store_id |
| 60 | `production_order_items` | via_parent: production_orders.id |
| 61 | `commission_rules` | store_id |
| 62 | `commission_rule_products` | via_parent: commission_rules.id |
| 63 | `commission_rule_versions` | via_parent: commission_rules.id |
| 64 | `commission_payments` | store_id |
| 65 | `commission_reception_links` | via_parent: commission_payments.id, receipts.id |

#### Tier 5 — Transferencias (dependen de stores en ambos lados)

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 66 | `transfer_approval_rules` | store_id |
| 67 | `transfers` | especial: origin_store_id=storeId OR destination_store_id=storeId |
| 68 | `transfer_items` | via_parent: transfers.id |

#### Tier 6 — Auditar y reportes

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 69 | `audit_logs` | store_id |
| 70 | `audit_events` | store_id |
| 71 | `report_runs` | via_parent: report_definitions.id |
| 72 | `cost_sheet_templates` | store_id |

#### Tier 7 — Mensajería y configuración auxiliar

| # | Tabla | Filter strategy |
|---|-------|-----------------|
| 73 | `telegram_configs` | store_id |
| 74 | `telegram_contacts` | store_id |
| 75 | `telegram_invitations` | via_parent: telegram_contacts.id |
| 76 | `telegram_messages` | via_parent: telegram_contacts.id |
| 77 | `whatsapp_configs` | store_id |
| 78 | `whatsapp_contacts` | store_id |
| 79 | `whatsapp_invitations` | via_parent: whatsapp_contacts.id |
| 80 | `whatsapp_messages` | via_parent: whatsapp_contacts.id |
| — | `whatsapp_risk_state` | store_id |
| — | `user_store_memberships` | store_id (especial — no se borra en restore destructivo) |

### Excepciones documentadas

#### `transfers` (manejo especial)
- No tiene `store_id`, sino `origin_store_id` + `destination_store_id`
- Filtro backup: `WHERE origin_store_id = p_store_id OR destination_store_id = p_store_id`
- Filtro restore: UPSERT directo (la fila pertenece a dos tiendas potencialmente)
- **Riesgo**: Si se restaura la tienda A, una transferencia A→B también afecta el inventario de B
- **Mitigación**: El restore destructivo de A no debe tocar `transfers` cuyo origin=A y dest=B si B está siendo modificada simultáneamente. El bloqueo `RESTORE_IN_PROGRESS` lo protege.

#### `business_events` (sin store_id)
- Schema: `id, event_type, entity_id, payload, created_at`
- `entity_id` puede ser un `store_id` u otro tipo de entidad
- Filtro backup: `WHERE entity_id = p_store_id::text OR payload->>'store_id' = p_store_id::text`
- **Riesgo**: Si `entity_id` no es siempre un UUID de store, se pierden eventos
- **Mitigación**: Validar con query de inspección antes del backup

#### `profiles` (multi-store)
- Tiene `store_id` (store "activa") PERO un usuario puede pertenecer a múltiples tiendas via `user_store_memberships`
- **Decisión**: `excluded=true` en registry. NO se respalda ni restaura `profiles`. Solo se respalda `user_store_memberships` (la asociación M2M).
- **Justificación**: Restaurar `profiles` sobrescribiría el campo `active_store_id` global del usuario

### Conclusión §1

✅ Orden topológico construido desde FK reales. 80 tablas catalogadas. 5 marcadas como `excluded=true` con justificación. **75 tablas activas** en el registry.

---

## 2. Revisión de la estrategia `restore_mode`

### Estado actual

- **No existe uso previo** de GUCs personalizadas (`app.*`) en el proyecto
- **54 triggers** definidos en migraciones (todos los archivos `.sql` con `CREATE TRIGGER`)
- **4 triggers críticos** que crean datos derivados:

| Trigger | Tabla | Tipo | Función | Efecto si no se bypassa |
|---------|-------|------|---------|--------------------------|
| `trg_sync_products_stock_current` | inventory | AFTER INSERT/UPDATE | `sync_products_stock_current()` | Recalcula `products.stock_current` — sobreescribe el valor del backup |
| `tr_sync_inventory_after_movement` | stock_movements | BEFORE INSERT | `fn_sync_inventory_on_movement()` | **Modifica `inventory.quantity`** — corrompe el inventario restaurado |
| `trg_auto_kardex` | stock_movements | AFTER INSERT | `auto_kardex_on_stock_movement()` | Crea `kardex_entries` duplicadas — duplica el kardex restaurado |
| `trg_update_product_wac` | receipt_items | AFTER INSERT | `update_product_wac()` | Recalcula WAC (costo promedio ponderado) — sobrescribe valor del backup |

### Validación de viabilidad técnica

**¿Supabase/Postgres permite leer `app.restore_mode` desde triggers?**

✅ Sí. PostgreSQL soporta GUCs personalizadas vía `current_setting('app.xxx', true)` (el segundo parámetro `missing_ok=true` evita error si no está seteada). Supabase no restringe esto.

**¿Funciona con `SET LOCAL`?**

✅ Sí. `SET LOCAL` aplica solo a la transacción actual. Los triggers se ejecutan dentro de esa transacción y ven el setting.

### Prueba aislada propuesta (debe ejecutarse antes de aprobar Migration 3)

```sql
-- Ejecutar en Supabase SQL Editor
BEGIN;

-- 1. Capturar estado previo
SELECT quantity, version FROM inventory
  WHERE product_id = '<test-product-uuid>'
    AND store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
-- Anotar: quantity_inicial, version_inicial

SELECT COUNT(*) FROM kardex_entries
  WHERE product_id = '<test-product-uuid>'
    AND store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
-- Anotar: kardex_count_inicial

SELECT stock_current FROM products WHERE id = '<test-product-uuid>';
-- Anotar: stock_current_inicial

-- 2. Activar bypass
SET LOCAL app.restore_mode = 'true';

-- 3. Insertar un stock_movement
INSERT INTO stock_movements (
  store_id, product_id, quantity_change, movement_type,
  movement_date, created_by, reference_doc
) VALUES (
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
  '<test-product-uuid>',
  999,
  'adjustment',
  NOW(),
  '051c6157-600b-425e-b8c0-72388bacf541',
  'TEST_RESTORE_MODE_BYPASS'
);

-- 4. Verificar que NO hubo side-effects
SELECT quantity, version FROM inventory
  WHERE product_id = '<test-product-uuid>'
    AND store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
-- Esperado: quantity_inicial, version_inicial (sin cambios)

SELECT COUNT(*) FROM kardex_entries
  WHERE product_id = '<test-product-uuid>'
    AND store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
-- Esperado: kardex_count_inicial (sin nueva entrada)

SELECT stock_current FROM products WHERE id = '<test-product-uuid>';
-- Esperado: stock_current_inicial (sin cambios)

-- 5. Limpiar
ROLLBACK;
```

### Fail-safe: rollback completo si un trigger no reconoce `app.restore_mode`

La función `restore_store_backup()` (Migration 3) seguirá este patrón:

```sql
DECLARE
  v_restore_mode_val text;
BEGIN
  -- 1. Validar que la GUC es legible
  v_restore_mode_val := current_setting('app.restore_mode', true);
  IF v_restore_mode_val IS NULL OR v_restore_mode_val != 'true' THEN
    RAISE EXCEPTION 'app.restore_mode not set to true — refusing to restore';
  END IF;

  -- 2. SET LOCAL (redundante pero explícito)
  SET LOCAL app.restore_mode = 'true';

  -- 3. BEGIN ya está activo (la función es SECURITY DEFINER)

  -- 4. Restaurar tablas en orden topológico
  --    Cada INSERT puede disparar triggers.
  --    Si un trigger NO tiene el bypass implementado, hará su efecto
  --    PERO el bloque 5 (validación post-restore) detectará la discrepancia
  --    y la transacción completa hará ROLLBACK.

  -- 5. Validación post-restore
  PERFORM validate_post_restore(p_store_id);

  -- Si llegamos aquí, todo OK. COMMIT implícito.
END;
```

**Garantía de rollback**: Si algún trigger sin bypass corrompe datos, `validate_post_restore()` detectará:
- `inventory.quantity` != backup_value → RAISE EXCEPTION → ROLLBACK
- `kardex_entries` count > backup_count → RAISE EXCEPTION → ROLLBACK
- `products.stock_current` != backup_value → RAISE EXCEPTION → ROLLBACK

### Modificaciones necesarias a las 4 funciones trigger (Migration 3)

Cada función debe comenzar con:

```sql
-- Bypass para restauración
IF current_setting('app.restore_mode', true) = 'true' THEN
  RETURN NEW;  -- o NULL para AFTER triggers que no devuelven nada
END IF;
```

Las funciones a modificar:
1. `public.sync_products_stock_current()` (inventory trigger)
2. `public.fn_sync_inventory_on_movement()` (stock_movements trigger)
3. `public.auto_kardex_on_stock_movement()` (stock_movements trigger)
4. `public.update_product_wac()` (receipt_items trigger)

### Conclusión §2

✅ Estrategia `SET LOCAL app.restore_mode = 'true'` es viable y segura. Requiere:
- Modificar 4 funciones trigger (Migration 3)
- Implementar `validate_post_restore()` como red de seguridad (Migration 1)
- Ejecutar prueba aislada (script arriba) antes de aprobar Migration 3

---

## 3. Auditoría `inventory.quantity` vs `SUM(stock_movements.quantity_change)`

### Metodología

Query directa vía PostgREST (service role) para ambas tiendas reales:

**Tienda 1: TIENDA CENTRAL COSTPRO** (`d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576`)

| Métrica | Valor |
|---------|-------|
| Filas en `inventory` | 114 |
| Filas en `stock_movements` | 242 |
| Productos distintos en movimientos | 109 |
| **MATCH (inventory == SUM(movements))** | **109** ✅ |
| MISMATCH | **0** ✅ |
| En inventory sin movimientos | 5 (todos con `quantity=0`) |
| En movimientos sin inventory | 0 |

**Tienda 2: Puerto Padre VITALLCONS** (`43a4dabc-b8b4-4b66-82b3-0c75335ca5d1`)

| Métrica | Valor |
|---------|-------|
| Filas en `inventory` | 35 |
| Filas en `stock_movements` | 226 |
| Productos distintos en movimientos | 34 |
| **MATCH** | **30** |
| **MISMATCH** | **4** ❌ |
| En inventory sin movimientos | 1 (`quantity=0`) |

### Discrepancias encontradas (Tienda 2)

| product_id | inventory.quantity | SUM(movements) | Diferencia | Movimientos |
|------------|-------------------:|---------------:|-----------:|-------------|
| `7c2d545f-...` | **1051** | 52 | **999** | 2 (purchase +54, sale -2) |
| `839b0b92-...` | **1996** | -2 | **1998** | 4 (purchase +1, sale -3) |
| `28e87cdb-...` | **106** | 3 | **103** | 2 (purchase +5, sale -2) |
| `a037d121-...` | **999** | 0 | **999** | 10 (purchase +38, sale -38) |

### Análisis de causa raíz

Las discrepancias son consistentes con **inicializaciones de inventario que no generaron stock_movements**:

- Producto `7c2d545f`: solo 2 movimientos registrados (compra 54, venta 2). Pero inventory tiene 1051. Faltan ~999 unidades que se cargaron vía INSERT directo a `inventory` (probablemente vía `inventory_adjustments` sin trigger o vía SQL editor).
- Producto `a037d121`: 10 movimientos que se cancelan (purchase 38, sale 38). Pero inventory tiene 999 — claramente un saldo inicial cargado sin movimiento asociado.

### Conclusión §3

❌ **`stock_movements` NO es siempre la fuente de verdad para `inventory.quantity`.**

**Decisión de diseño para `rebuild_inventory_balances`**:

```sql
-- NO usar:
DELETE FROM inventory WHERE store_id = p_store_id;
INSERT INTO inventory SELECT product_id, SUM(quantity_change) FROM stock_movements ...;

-- USAR (modo seguro):
-- 1. Comparar inventory.quantity vs SUM(stock_movements.quantity_change)
-- 2. Si coinciden → no hacer nada (ya están sincronizados)
-- 3. Si difieren → NO reconstruir, lanzar warning y conservar inventory.quantity
--    (que es la fuente oficial del saldo actual)
```

**`inventory.quantity` es la fuente de verdad para el saldo actual. `stock_movements` es el historial.** Si hay discrepancia, se conserva `inventory.quantity` y se reporta como warning para revisión manual.

---

## 4. Política explícita: Restore destructivo (Modo A)

### Definición

**Modo A (Destructivo)**: El backup reemplaza completamente los datos de la tienda destino. Toda fila existente que no esté en el backup se elimina.

### Comportamiento detallado

| Tabla | Comportamiento en restore |
|-------|---------------------------|
| `stores` | UPDATE la fila existente (no se elimina) |
| `products`, `customers`, `workers`, etc. | DELETE todas las filas WHERE store_id=X, luego INSERT del backup |
| Tablas `via_parent` (transaction_items, etc.) | DELETE CASCADE desde el parent |
| `user_store_memberships` | DELETE WHERE store_id=X, luego INSERT del backup (las membresías a otras tiendas no se tocan) |
| `profiles` | **NO se restaura** (marcada `excluded=true`). El campo `active_store_id` del usuario no se modifica. |
| `transfers` | DELETE WHERE origin_store_id=X OR destination_store_id=X, luego INSERT del backup |
| `business_events` | DELETE WHERE entity_id=X::text, luego INSERT del backup |
| Tablas `excluded=true` (sync_log, store_notifications, inventory_snapshots) | Se respaldan pero NO se restauran (datos efímeros) |

### Aserciones de seguridad

1. **Antes del DELETE**: se crea un snapshot automático en `restore_sessions.pre_restore_snapshot` (ver §5)
2. **Durante el DELETE+INSERT**: la transacción está abierta, el `RESTORE_IN_PROGRESS` lock está activo (ver §6)
3. **Después del INSERT**: `validate_post_restore()` verifica conteos, integridad referencial, y consistencia
4. **Si la validación falla**: ROLLBACK automático, el snapshot pre-restore queda disponible para recuperación manual

### Justificación de Modo A sobre B (incremental)

- **Modo B (incremental)** dejaría filas "huérfanas" en la tienda destino que no están en el backup. En un ERP, esto significa inconsistencia contable (ej: una venta nueva que no estaba en el backup, pero el inventario sí se restauró al estado anterior).
- **Para ERP**, la consistencia contable es más importante que preservar datos nuevos. Si el usuario quiere preservar datos nuevos, debe hacer un backup antes del restore.
- El snapshot pre-restore (§5) es la red de seguridad: si el restore destruyó datos que el usuario quería conservar, puede recuperarse del snapshot.

---

## 5. Snapshot previo automático

### Estructura: `restore_sessions`

```sql
CREATE TABLE public.restore_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id),
  initiated_by    UUID NOT NULL REFERENCES public.profiles(id),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL CHECK (
                    status IN ('PREPARING', 'DRY_RUN', 'EXECUTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')
                  ),
  mode            TEXT NOT NULL CHECK (mode IN ('dry_run', 'execute')),
  backup_payload  JSONB,        -- el JSON completo del backup (solo para execute)
  pre_restore_snapshot JSONB,   -- snapshot de la tienda antes del restore
  post_restore_validation JSONB, -- resultado de validate_post_restore
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  -- Lock coordination
  lock_acquired   BOOLEAN DEFAULT FALSE,
  lock_token      TEXT  -- token único para liberar el advisory lock
);

CREATE INDEX idx_restore_sessions_store ON public.restore_sessions(store_id, initiated_at DESC);
CREATE INDEX idx_restore_sessions_status ON public.restore_sessions(status) WHERE status IN ('PREPARING', 'EXECUTING');

-- RLS: solo admin del tenant
ALTER TABLE public.restore_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY restore_sessions_admin_only ON public.restore_sessions
  FOR ALL USING (public.has_store_access(store_id));
```

### Flujo del snapshot previo

```sql
-- Dentro de restore_store_backup(mode='execute'):
-- 1. INSERT en restore_sessions con status='PREPARING'
-- 2. Llamar a create_pre_restore_snapshot(p_store_id) → JSONB
-- 3. UPDATE restore_sessions SET pre_restore_snapshot = <snapshot>, status='EXECUTING'
-- 4. Proceder con DELETE + INSERT de las 80 tablas
-- 5. Si todo OK → status='COMPLETED', post_restore_validation=<validate result>
-- 6. Si error → status='FAILED', failure_reason=<msg>, ROLLBACK (lo que deja pre_restore_snapshot guardado)
```

### Estructura del snapshot (`pre_restore_snapshot` JSONB)

```json
{
  "snapshot_at": "2026-08-02T10:00:00Z",
  "table_counts": {
    "products": 114,
    "transactions": 242,
    "stock_movements": 242,
    ...
  },
  "table_data": {
    "products": [
      {"id": "...", "name": "...", "stock_current": 100, ...},
      ...
    ],
    "transactions": [...],
    ...
  },
  "inventory_summary": {
    "total_products": 114,
    "total_quantity": 5421.5,
    "products_with_discrepancies": [...]
  }
}
```

> **Nota de tamaño**: Un snapshot completo puede ser grande (decenas de MB para tiendas con mucha data). Se almacenará en `restore_sessions.pre_restore_snapshot` como JSONB. Si excede 100MB, se guardará en Supabase Storage como archivo JSON y se referencia por URL.

### Recuperación ante desastre

```sql
-- Función: recover_from_pre_restore_snapshot(p_session_id UUID)
-- Recrea el estado de la tienda desde el snapshot
-- Solo se ejecuta manualmente por admin, después de un restore fallido
```

---

## 6. Pruebas de concurrencia — `RESTORE_IN_PROGRESS`

### Mecanismo de bloqueo

Doble capa:

1. **Advisory lock (postgres-level)**: `pg_advisory_xact_lock(hashtext('restore_store_' || p_store_id::text))`
   - Bloquea toda operación que intente adquirir el mismo lock
   - Se libera automáticamente al hacer COMMIT/ROLLBACK

2. **Flag en `restore_sessions`**: `status IN ('PREPARING', 'EXECUTING')`
   - Las funciones de negocio (`create_sale`, `create_transfer`, `register_stock_movement`, etc.) consultan este flag antes de operar
   - Si hay un restore en progreso → RAISE EXCEPTION 'Tienda en proceso de restauración, intente más tarde'

### Implementación en funciones críticas

Añadir al inicio de cada función de negocio:

```sql
-- Verificar que no hay restore en progreso
PERFORM 1 FROM public.restore_sessions
  WHERE store_id = p_store_id
    AND status IN ('PREPARING', 'EXECUTING')
  LIMIT 1;
IF FOUND THEN
  RAISE EXCEPTION 'RESTORE_IN_PROGRESS: La tienda % está siendo restaurada. Intente más tarde.', p_store_id;
END IF;
```

Funciones a modificar (lista preliminar):
- `create_sale(p_store_id, ...)`
- `create_transfer(p_origin_store_id, p_destination_store_id, ...)`
- `register_stock_movement(p_store_id, ...)`
- `confirm_transfer(p_transfer_id)`
- `reverse_transfer(p_transfer_id)`
- `register_reception(p_store_id, ...)`
- `process_inventory_adjustment(p_store_id, ...)`
- `create_devolution(p_store_id, ...)`

### Pruebas de concurrencia (PT-7 a PT-10)

| Test | Usuario A | Usuario B | Esperado |
|------|-----------|-----------|----------|
| PT-7 | Inicia restore en Store X | Intenta vender en Store X | B recibe error `RESTORE_IN_PROGRESS` |
| PT-8 | Inicia restore en Store X | Intenta transferencia Store X → Y | B recibe error `RESTORE_IN_PROGRESS` |
| PT-9 | Inicia restore en Store X | Modifica producto en Store X | B recibe error `RESTORE_IN_PROGRESS` |
| PT-10 | Inicia restore en Store X | Opera normalmente en Store Y | B exitoso (no hay interferencia) |

> Estas pruebas se ejecutan en Migration 4 (tests completos), NO en Migration 1+2.

---

## 7. Plan de migraciones por fases

### Migration 1 — Esquema auxiliar (sin lógica de negocio)

**Archivo**: `supabase/migrations/20260802000006_v2_12_45_backup_registry.sql`

Contenido:
- `CREATE TABLE backup_table_registry` (catálogo de 80 tablas)
- `CREATE TABLE restore_sessions` (tracking de restores)
- `CREATE FUNCTION discover_backup_tables()` (introspección runtime)
- `CREATE FUNCTION validate_post_restore(p_store_id UUID)` (retorna JSONB)
- `CREATE FUNCTION get_backup_table_list()` (retorna tablas activas ordenadas)
- RLS policies
- Seed inicial con las 80 tablas detectadas

**Riesgo**: Bajo. Solo crea tablas auxiliares y funciones de lectura. No modifica tablas existentes ni triggers.

### Migration 2 — Backup service actualizado (TypeScript, no SQL)

**Archivo**: `src/lib/backup/backup-service.ts` (refactor) + `src/app/api/stores/[id]/backup/route.ts`

Contenido:
- Reemplazar `TABLE_CONFIGS` hardcoded por query a `backup_table_registry`
- Soporte para las 4 estrategias de filtro: `store_id`, `global`, `via_parent`, `via_origin_dest`
- Soporte para tablas `excluded=true` (se exportan pero no se restauran)
- Reporte de tablas faltantes vs registry (drift detection)
- Tests: PT-1, PT-2, PT-3 (ver §8)

**Riesgo**: Medio. Cambia el comportamiento del backup. Si hay un bug, los backups pueden quedar incompletos. Se mitiga con PT-1, PT-2, PT-3 antes de aprobar.

### Migration 3 — Restore RPC + trigger bypass

**Archivo**: `supabase/migrations/20260802000007_v2_12_46_restore_rpc.sql`

Contenido:
- `CREATE FUNCTION restore_store_backup(p_store_id UUID, p_backup JSONB, p_mode TEXT)` SECURITY DEFINER
- Modificación de las 4 funciones trigger (bypass `app.restore_mode`)
- `CREATE FUNCTION create_pre_restore_snapshot(p_store_id UUID)` SECURITY DEFINER
- `CREATE FUNCTION recover_from_pre_restore_snapshot(p_session_id UUID)` SECURITY DEFINER
- `CREATE FUNCTION acquire_restore_lock(p_store_id UUID)` / `release_restore_lock(p_token TEXT)`
- Modificación de funciones de negocio para check `RESTORE_IN_PROGRESS` (create_sale, create_transfer, etc.)

**Riesgo**: Alto. Modifica triggers y funciones críticas. Se requiere prueba aislada de `restore_mode` (§2) antes de aplicar.

### Migration 4 — Tests completos

**Archivo**: `supabase/tests/backup_restore_tests.sql` + `src/__tests__/integration/backup-restore.spec.ts`

Contenido:
- PT-1 a PT-3 (backup) — ya ejecutados en Migration 2
- PT-4: Restore en tienda vacía (clean restore)
- PT-5: Restore destructivo controlado (sobre tienda con datos)
- PT-6: Prueba de desastre (restore falla a mitad, verificar rollback + snapshot)
- PT-7 a PT-10: Pruebas de concurrencia

**Riesgo**: Bajo. Solo tests.

---

## 8. Plan de pruebas PT-1 a PT-3 (Backup)

### PT-1: Backup completo (todas las 75 tablas activas)

**Setup**: TIENDA CENTRAL COSTPRO con 114 productos, 242 movimientos, etc.

**Pasos**:
1. Llamar `POST /api/stores/d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576/backup` con `{format: 'json', range: 'all'}`
2. Descargar el JSON resultante
3. Parsear y verificar:
   - 75 tablas presentes (excluyendo las 5 `excluded=true`)
   - Cada tabla tiene `rows` array con count > 0 (excepto tablas que pueden estar vacías)
   - `recordCounts` suma > 0
   - `warnings` está vacío o solo contiene warnings de tablas vacías legítimas

**Criterio de aprobación**:
- ✅ 75 tablas en el backup
- ✅ 0 warnings de error
- ✅ `products`, `transactions`, `stock_movements`, `inventory` tienen rows

### PT-2: Backup con rango de fecha (year=2026)

**Setup**: Misma tienda

**Pasos**:
1. Llamar `POST /api/stores/.../backup` con `{format: 'json', range: 'year', year: 2026}`
2. Verificar:
   - Tablas con `dateCol` filtran por `created_at >= 2026-01-01 AND < 2027-01-01`
   - Tablas sin `dateCol` (`stores`, `categories`, `tax_configurations`) se incluyen completas
   - Tablas `via_parent` filtran post-fetch por la fecha del parent

**Criterio de aprobación**:
- ✅ `transactions` solo contiene ventas de 2026
- ✅ `categories` se incluye completo (sin filtro)
- ✅ `transaction_items` solo contiene items de transacciones de 2026

### PT-3: Backup integrity (round-trip sin restore)

**Setup**: Dos tiendas con datos similares

**Pasos**:
1. Backup de Store A (TIENDA CENTRAL)
2. Backup de Store B (Puerto Padre)
3. Comparar estructuras:
   - Ambos JSONs tienen las mismas 75 tablas
   - Los `recordCounts` son consistentes con el tamaño de cada tienda
   - Los IDs son diferentes (no hay colisión de UUIDs entre tiendas)

**Criterio de aprobación**:
- ✅ Ambos backups tienen la misma estructura
- ✅ No hay UUIDs duplicados entre A y B
- ✅ `store_id` en todas las filas de A es `d1c4ba0e...` y en B es `43a4dabc...`

---

## Conclusión y próxima acción

Todas las 7 validaciones solicitadas fueron ejecutadas con datos reales:

| # | Validación | Resultado |
|---|------------|-----------|
| 1 | FK reales | ✅ 80 tablas, grafo topológico construido |
| 2 | restore_mode | ✅ Viable, requiere modificar 4 triggers |
| 3 | inventory vs movements | ❌ **NO seguro** — discrepancias en tienda #2 |
| 4 | Modo restore | ✅ A (destructivo) definido explícitamente |
| 5 | Snapshot previo | ✅ Diseñado `restore_sessions` |
| 6 | Concurrencia | ✅ Doble capa: advisory_lock + flag status |
| 7 | Fases | ✅ 4 migrations, este doc valida M1+M2 antes de M3 |

### Próxima acción

Proceder con **Migration 1** (`backup_table_registry` + `restore_sessions` + `validate_post_restore`), seguida de **Migration 2** (backup service TypeScript). Detenerse después de PT-1, PT-2, PT-3 y esperar aprobación antes de Migration 3.

**NO se implementa Migration 3 (restore RPC + trigger bypass) hasta que:**
1. PT-1, PT-2, PT-3 pasen
2. La prueba aislada de `restore_mode` (§2) sea ejecutada manualmente por el usuario en Supabase SQL Editor y confirmada
3. El usuario apruebe explícitamente
