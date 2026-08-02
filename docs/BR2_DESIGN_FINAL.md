# BR-2 Restore RPC — Diseño Final (antes de aplicar)

**Fecha:** 2026-08-02
**Iteración:** 7 — Backup Restore
**Componente:** BR-2 — `restore_store_backup()` RPC + `restore_mode` + validación post-restore
**Estado:** Diseño — pendiente aprobación del usuario antes de aplicar

---

## Resumen Ejecutivo

BR-2 se implementa en **3 fases incrementales** según lo solicitado por el usuario:

| Fase | Contenido | Riesgo |
|------|-----------|--------|
| **Fase 1** | `restore_sessions` (ya existe de Migration 1), `validate_post_restore()` ampliado, `restore_store_backup(mode='preview')` — solo parsing y validación, **sin escritura destructiva** | Bajo |
| **Fase 2** | `SET LOCAL app.restore_mode='true'` + bypass en 6 triggers críticos + `restore_store_backup(mode='execute')` con transacción atómica y rollback | Alto |
| **Fase 3** | PT-4 a PT-8 (restore vacía, fallo intermedio, no duplicación, validación, inventory primaria) | Bajo |

**Reglas intocables del Truth Model** (no se modifican en ninguna fase):
- ✅ `inventory.quantity` = **primary** (se restaura directo, no se reconstruye desde `stock_movements`)
- ✅ `products.stock_current` = **derived** (sincronizado desde `inventory` vía trigger al final del restore)
- ✅ `stock_movements` = **audit** (se restaura directo, no se usa para reconstruir `inventory`)
- ✅ `kardex_entries` = **audit** (se restaura directo)
- ❌ `rebuild_inventory_balances()` **NO se implementa**
- ❌ `profiles`, `user_store_memberships`, `tenants` **no se modifican** en el restore

---

## Trigger Audit Real (verificado en DB)

Identifiqué **12 triggers activos** que se disparan durante un restore. Los que requieren bypass `restore_mode` son **6** (los que modifican datos derivados o crean registros duplicados):

### Triggers que requieren bypass (`restore_mode='true'`)

| # | Tabla | Trigger | Función | Tipo | Razón de bypass |
|---|-------|---------|---------|------|-----------------|
| 1 | `inventory` | `trg_sync_products_stock_current` | `sync_products_stock_current()` | AFTER ROW | Recalcula `products.stock_current` durante INSERT del restore — sobrescribe el valor del backup. Se sincroniza al final del restore con un UPDATE explícito. |
| 2 | `inventory` | `trigger_prevent_inventory_update` | `prevent_direct_inventory_modification()` | BEFORE STATEMENT | Bloquea cualquier UPDATE directo a `inventory`. Durante restore, hacemos INSERT directo, no vía `stock_movements`. |
| 3 | `inventory` | `trg_prevent_negative_inventory` | `prevent_negative_inventory()` | BEFORE STATEMENT | Bloquea cantidades negativas. Si el backup tiene un `inventory.quantity` negativo (legítimo para devoluciones pendientes), el restore fallaría. |
| 4 | `inventory` | `trg_alert_low_stock` | `alert_low_stock()` | AFTER STATEMENT | Genera `business_events` con `low_stock_alert` para cada producto bajo umbral durante restore — duplica eventos. |
| 5 | `stock_movements` | `tr_sync_inventory_after_movement` | `fn_sync_inventory_on_movement()` | BEFORE ROW | **CRÍTICO** — Modifica `inventory.quantity` cuando insertamos `stock_movements`. Durante restore, `inventory` ya está restaurado; este trigger corrompería el saldo. |
| 6 | `stock_movements` | `trg_auto_kardex` | `auto_kardex_on_stock_movement()` | AFTER ROW | **CRÍTICO** — Crea `kardex_entries` duplicadas para cada `stock_movement` insertado. |
| 7 | `stock_movements` | `trg_sync_product_stock` | `sync_product_stock()` | AFTER ROW | Recalcula `products.stock_current` desde el último `stock_movement` — sobrescribe el valor restaurado. |
| 8 | `receipt_items` | `trg_update_product_wac` | `update_product_wac()` | AFTER ROW | Recalcula WAC (costo promedio ponderado) durante restore — sobrescribe el valor del backup. |
| 9 | `receipt_items` | `trg_sync_has_movements_receipt` | `sync_product_has_movements()` | AFTER ROW | Marca `products.has_movements = true` — innecesario durante restore. |
| 10 | `transaction_items` | `trg_sync_has_movements_sale` | `sync_product_has_movements()` | AFTER ROW | Igual que arriba. |
| 11 | `inventory_movements` | `trg_sync_has_movements_inv` | `sync_product_has_movements()` | AFTER ROW | Igual que arriba. |
| 12 | `profiles` | `trg_sync_profile_role` | `fn_sync_profile_role()` | BEFORE ROW | Sincroniza `profiles.role` con `profiles.role_id` — no se toca `profiles` en restore, pero si un trigger lo dispara indirectamente, debe respetar el bypass. |

> **Nota**: Los triggers 9-11 son solo optimización (bandera `has_movements`). Se les hace bypass por consistencia. El trigger 12 no se dispara durante restore porque no tocamos `profiles`.

### Triggers que NO requieren bypass

Los triggers de `updated_at` (`commission_payments_touch_updated_at`, `sales_transactions_touch_updated_at`, etc.) son inofensivos — solo actualizan timestamps. Se mantienen activos.

---

## Fase 1 — Esquema y Preview (sin escritura destructiva)

### Objetivo

Crear las funciones de validación y un modo `preview` que **no escriba nada** en la DB. Solo parsea el backup, valida estructura, orden de tablas, dependencias FK y consistencia con `source_of_truth`.

### Componentes

#### 1.1 `validate_post_restore(p_store_id UUID, p_backup_payload JSONB)` — Ampliado

Reemplaza el esqueleto de Migration 1 con la versión completa. Retorna JSONB estructurado:

```sql
CREATE OR REPLACE FUNCTION public.validate_post_restore(
  p_store_id UUID,
  p_backup_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_inventory_count INTEGER;
  v_movements_count INTEGER;
  v_products_count INTEGER;
  v_kardex_count INTEGER;
  v_inventory_mismatches INTEGER := 0;
  v_trigger_failures INTEGER := 0;
  v_legacy_discrepancies INTEGER := 0;
  v_backup_inventory_count INTEGER := 0;
  v_backup_products_count INTEGER := 0;
BEGIN
  -- Conteos actuales post-restore
  SELECT COUNT(*) INTO v_inventory_count
  FROM public.inventory WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_movements_count
  FROM public.stock_movements WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_products_count
  FROM public.products WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_kardex_count
  FROM public.kardex_entries WHERE store_id = p_store_id;

  -- Si se proporciona el backup, validar consistencia
  IF p_backup_payload IS NOT NULL THEN
    -- Contar filas esperadas en el backup
    v_backup_inventory_count := jsonb_array_length(
      COALESCE(p_backup_payload->'tables'->'inventory', '[]'::jsonb)
    );
    v_backup_products_count := jsonb_array_length(
      COALESCE(p_backup_payload->'tables'->'products', '[]'::jsonb)
    );

    -- CHECK 1 (CRÍTICO): inventory.quantity restaurado == backup
    -- Esta es la validación que el usuario solicitó explícitamente
    SELECT COUNT(*) INTO v_inventory_mismatches
    FROM public.inventory i
    WHERE i.store_id = p_store_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          COALESCE(p_backup_payload->'tables'->'inventory', '[]'::jsonb)
        ) AS b
        WHERE (b->>'product_id')::UUID = i.product_id
          AND (b->>'quantity')::NUMERIC = i.quantity
      );

    -- CHECK 2: products.stock_current == inventory.quantity (consistencia de trigger)
    SELECT COUNT(*) INTO v_trigger_failures
    FROM public.products p
    JOIN public.inventory i ON i.product_id = p.id AND i.store_id = p.store_id
    WHERE p.store_id = p_store_id
      AND p.stock_current != i.quantity;

    -- CHECK 3 (WARNING, no error): inventory != SUM(stock_movements)
    -- Esperado para datos legacy (4 productos en Puerto Padre)
    SELECT COUNT(*) INTO v_legacy_discrepancies
    FROM (
      SELECT i.product_id, i.quantity as inv_qty,
             COALESCE(SUM(sm.quantity_change), 0) as mov_sum
      FROM public.inventory i
      LEFT JOIN public.stock_movements sm
        ON sm.product_id = i.product_id AND sm.store_id = i.store_id
      WHERE i.store_id = p_store_id
      GROUP BY i.product_id, i.quantity
    ) t
    WHERE inv_qty != mov_sum;
  END IF;

  v_result := jsonb_build_object(
    'validated_at', NOW(),
    'store_id', p_store_id,
    'counts', jsonb_build_object(
      'inventory', v_inventory_count,
      'stock_movements', v_movements_count,
      'products', v_products_count,
      'kardex_entries', v_kardex_count
    ),
    'backup_counts', jsonb_build_object(
      'inventory', v_backup_inventory_count,
      'products', v_backup_products_count
    ),
    'checks', jsonb_build_object(
      'inventory_matches_backup', jsonb_build_object(
        'status', CASE WHEN v_inventory_mismatches = 0 THEN 'PASS' ELSE 'FAIL' END,
        'mismatches', v_inventory_mismatches,
        'severity', 'CRITICAL',
        'description', 'inventory.quantity restaurado debe coincidir con el backup'
      ),
      'products_stock_current_consistency', jsonb_build_object(
        'status', CASE WHEN v_trigger_failures = 0 THEN 'PASS' ELSE 'FAIL' END,
        'failures', v_trigger_failures,
        'severity', 'HIGH',
        'description', 'products.stock_current debe ser igual a inventory.quantity'
      ),
      'inventory_movements_legacy_discrepancies', jsonb_build_object(
        'status', 'WARN',
        'discrepancies', v_legacy_discrepancies,
        'severity', 'INFO',
        'description', 'inventory.quantity != SUM(stock_movements) — esperado para datos legacy'
      )
    ),
    'overall_status', CASE
      WHEN v_inventory_mismatches > 0 THEN 'FAIL'
      WHEN v_trigger_failures > 0 THEN 'FAIL'
      ELSE 'PASS'
    END
  );

  RETURN v_result;
END;
$$;
```

#### 1.2 `restore_store_backup(p_store_id, p_backup_payload, p_mode)` — Modo Preview

Solo el modo `preview`. El modo `execute` se implementa en Fase 2.

```sql
CREATE OR REPLACE FUNCTION public.restore_store_backup(
  p_store_id UUID,
  p_backup_payload JSONB,
  p_mode TEXT DEFAULT 'preview'  -- 'preview' | 'execute'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_store_exists BOOLEAN;
  v_backup_format TEXT;
  v_backup_store_id TEXT;
  v_tables_in_backup TEXT[];
  v_table_count INTEGER;
  v_active_registry_count INTEGER;
  v_missing_tables TEXT[];
  v_extra_tables TEXT[];
  v_tier_violations JSONB;
  v_source_of_truth_violations JSONB;
  v_total_rows INTEGER := 0;
  v_table_stats JSONB := '{}'::jsonb;
  t RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
BEGIN
  -- ============================================================
  -- VALIDATE: store exists
  -- ============================================================
  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: Tienda % no existe', p_store_id;
  END IF;

  -- ============================================================
  -- VALIDATE: backup format and store_id match
  -- ============================================================
  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT: Se espera format=costpro-store-backup, got %', v_backup_format;
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID: meta.storeId es requerido';
  END IF;

  -- ============================================================
  -- CREATE SESSION: track this restore operation
  -- ============================================================
  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, auth.uid(), 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  -- ============================================================
  -- VALIDATE: backup tables vs registry
  -- ============================================================
  SELECT jsonb_object_keys(p_backup_payload->'tables') INTO v_tables_in_backup;
  -- Actually jsonb_object_keys returns a set, so use a different approach:
  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) t;

  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  -- Get active registry tables
  SELECT array_agg(table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE
  ORDER BY tier, table_name;

  -- Tables in backup but NOT in registry
  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  -- Tables in registry but NOT in backup
  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  -- ============================================================
  -- VALIDATE: source_of_truth invariants in registry
  -- ============================================================
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', table_name,
    'expected_source_of_truth', expected_sot,
    'actual_source_of_truth', source_of_truth
  )) INTO v_source_of_truth_violations
  FROM (VALUES
    ('inventory', 'primary'),
    ('stock_movements', 'audit'),
    ('kardex_entries', 'audit'),
    ('products', 'primary')
  ) AS v(table_name, expected_sot)
  JOIN public.backup_table_registry r USING (table_name)
  WHERE r.source_of_truth != v.expected_sot;

  -- ============================================================
  -- VALIDATE: tier ordering in backup matches registry
  -- ============================================================
  -- For each table in backup, check that its parent tables (if any)
  -- appear BEFORE it in the backup
  SELECT jsonb_agg(jsonb_build_object(
    'table', child_table,
    'parent', parent_table,
    'issue', 'parent not found before child in backup'
  )) INTO v_tier_violations
  FROM public.backup_table_registry r
  WHERE r.excluded_from_restore = FALSE
    AND r.parent_table IS NOT NULL
    AND r.table_name = ANY(v_tables_in_backup)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
      WHERE o.t = r.parent_table
        AND o.ord < (
          SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
          WHERE o2.t = r.table_name
        )
    );

  -- ============================================================
  -- COUNT rows per table in backup (for stats)
  -- ============================================================
  FOR t IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->t.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows)
                        ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[t.table_name],
                                to_jsonb(v_row_count));
  END LOOP;

  -- ============================================================
  -- UPDATE SESSION with preview results
  -- ============================================================
  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', 'preview',
        'backup_store_id', v_backup_store_id,
        'target_store_id', p_store_id,
        'table_count_in_backup', v_table_count,
        'active_tables_in_registry', array_length(v_active_registry_tables, 1),
        'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
        'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
        'tier_violations', COALESCE(v_tier_violations, '[]'::jsonb),
        'source_of_truth_violations', COALESCE(v_source_of_truth_violations, '[]'::jsonb),
        'total_rows_in_backup', v_total_rows,
        'table_stats', v_table_stats,
        'preview_passed', (v_missing_tables IS NULL OR array_length(v_missing_tables, 1) IS NULL)
                           AND (v_tier_violations IS NULL)
                           AND (v_source_of_truth_violations IS NULL)
      )
  WHERE id = v_session_id;

  -- ============================================================
  -- RETURN preview report
  -- ============================================================
  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'mode', 'preview',
    'target_store_id', p_store_id,
    'backup_store_id', v_backup_store_id,
    'table_count_in_backup', v_table_count,
    'active_tables_in_registry', array_length(v_active_registry_tables, 1),
    'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
    'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
    'tier_violations', COALESCE(v_tier_violations, '[]'::jsonb),
    'source_of_truth_violations', COALESCE(v_source_of_truth_violations, '[]'::jsonb),
    'total_rows_in_backup', v_total_rows,
    'table_stats', v_table_stats,
    'preview_passed', (v_missing_tables IS NULL OR array_length(v_missing_tables, 1) IS NULL)
                       AND (v_tier_violations IS NULL)
                       AND (v_source_of_truth_violations IS NULL)
  );
END;
$$;
```

#### 1.3 RLS en `restore_sessions`

La tabla `restore_sessions` ya existe de Migration 1 con RLS. La función es `SECURITY DEFINER` así que opera con privilegios de `postgres` y puede escribir en `restore_sessions` sin importar RLS.

### Salida esperada de `preview`

```json
{
  "session_id": "...",
  "mode": "preview",
  "target_store_id": "...",
  "backup_store_id": "...",
  "table_count_in_backup": 75,
  "active_tables_in_registry": 75,
  "missing_tables_in_registry": [],
  "extra_tables_in_registry": [],
  "tier_violations": [],
  "source_of_truth_violations": [],
  "total_rows_in_backup": 1041,
  "table_stats": {
    "stores": 1,
    "products": 114,
    "transactions": 20,
    ...
  },
  "preview_passed": true
}
```

---

## Fase 2 — Restore Real con `restore_mode`

### Objetivo

Implementar el modo `execute` que hace el restore destructivo real dentro de una transacción atómica, con bypass de triggers y rollback completo ante cualquier error.

### Componentes

#### 2.1 Modificación de los 6 triggers críticos

Cada función trigger se modifica para agregar al inicio:

```sql
-- Bypass durante restauración
IF current_setting('app.restore_mode', true) = 'true' THEN
  RETURN NEW;  -- o NULL para AFTER triggers sin retorno
END IF;
```

Las funciones a modificar:

1. `sync_products_stock_current()` — inventory trigger
2. `prevent_direct_inventory_modification()` — inventory trigger
3. `prevent_negative_inventory()` — inventory trigger
4. `alert_low_stock()` — inventory trigger
5. `fn_sync_inventory_on_movement()` — stock_movements trigger
6. `auto_kardex_on_stock_movement()` — stock_movements trigger
7. `sync_product_stock()` — stock_movements trigger
8. `update_product_wac()` — receipt_items trigger
9. `sync_product_has_movements()` — receipt_items/transaction_items/inventory_movements trigger

> **Importante**: `sync_product_has_movements()` se usa en 3 tablas (`receipt_items`, `transaction_items`, `inventory_movements`). Solo se modifica una vez, afecta a las 3.

#### 2.2 `restore_store_backup(p_mode='execute')` — Implementación completa

Reemplaza la función de Fase 1 con la versión que también soporta `execute`:

```sql
CREATE OR REPLACE FUNCTION public.restore_store_backup(
  p_store_id UUID,
  p_backup_payload JSONB,
  p_mode TEXT DEFAULT 'preview'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_store_exists BOOLEAN;
  v_backup_format TEXT;
  v_backup_store_id TEXT;
  v_active_registry_tables TEXT[];
  v_table_count INTEGER;
  v_missing_tables TEXT[];
  v_extra_tables TEXT[];
  v_tier_violations JSONB;
  v_source_of_truth_violations JSONB;
  v_total_rows INTEGER := 0;
  v_table_stats JSONB := '{}'::jsonb;
  v_tables_processed INTEGER := 0;
  v_tables_failed INTEGER := 0;
  v_restore_mode_val TEXT;
  t RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
  v_pre_restore_snapshot JSONB;
  v_post_restore_validation JSONB;
  v_lock_acquired BOOLEAN;
  v_lock_token TEXT;
BEGIN
  -- ============================================================
  -- PHASE 0: VALIDATE (común a preview y execute)
  -- ============================================================
  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: Tienda % no existe', p_store_id;
  END IF;

  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT';
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID';
  END IF;

  -- Create session
  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, auth.uid(), 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  -- Get active registry tables (ordered by tier)
  SELECT array_agg(table_name ORDER BY tier, table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE;

  -- Validate backup tables vs registry
  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) t;
  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  -- source_of_truth invariants
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', table_name,
    'expected', expected_sot,
    'actual', source_of_truth
  )) INTO v_source_of_truth_violations
  FROM (VALUES
    ('inventory', 'primary'),
    ('stock_movements', 'audit'),
    ('kardex_entries', 'audit'),
    ('products', 'primary')
  ) AS v(table_name, expected_sot)
  JOIN public.backup_table_registry r USING (table_name)
  WHERE r.source_of_truth != v.expected_sot;

  -- Tier ordering check
  SELECT jsonb_agg(jsonb_build_object(
    'table', child_table, 'parent', parent_table,
    'issue', 'parent not found before child in backup'
  )) INTO v_tier_violations
  FROM public.backup_table_registry r
  WHERE r.excluded_from_restore = FALSE
    AND r.parent_table IS NOT NULL
    AND r.table_name = ANY(v_tables_in_backup)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
      WHERE o.t = r.parent_table
        AND o.ord < (
          SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
          WHERE o2.t = r.table_name
        )
    );

  -- Count rows per table
  FOR t IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->t.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows)
                        ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[t.table_name], to_jsonb(v_row_count));
  END LOOP;

  -- Update session with preview results
  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', p_mode,
        'backup_store_id', v_backup_store_id,
        'target_store_id', p_store_id,
        'table_count_in_backup', v_table_count,
        'active_tables_in_registry', array_length(v_active_registry_tables, 1),
        'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
        'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
        'tier_violations', COALESCE(v_tier_violations, '[]'::jsonb),
        'source_of_truth_violations', COALESCE(v_source_of_truth_violations, '[]'::jsonb),
        'total_rows_in_backup', v_total_rows,
        'table_stats', v_table_stats,
        'preview_passed', (v_missing_tables IS NULL OR array_length(v_missing_tables, 1) IS NULL)
                           AND (v_tier_violations IS NULL)
                           AND (v_source_of_truth_violations IS NULL)
      )
  WHERE id = v_session_id;

  -- ============================================================
  -- PREVIEW ONLY — return here, no destructive operations
  -- ============================================================
  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'session_id', v_session_id,
      'mode', 'preview',
      'target_store_id', p_store_id,
      'backup_store_id', v_backup_store_id,
      'table_count_in_backup', v_table_count,
      'active_tables_in_registry', array_length(v_active_registry_tables, 1),
      'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
      'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
      'tier_violations', COALESCE(v_tier_violations, '[]'::jsonb),
      'source_of_truth_violations', COALESCE(v_source_of_truth_violations, '[]'::jsonb),
      'total_rows_in_backup', v_total_rows,
      'table_stats', v_table_stats,
      'preview_passed', (v_missing_tables IS NULL OR array_length(v_missing_tables, 1) IS NULL)
                         AND (v_tier_violations IS NULL)
                         AND (v_source_of_truth_violations IS NULL)
    );
  END IF;

  -- ============================================================
  -- EXECUTE MODE — destructive restore with transaction
  -- ============================================================
  IF p_mode != 'execute' THEN
    RAISE EXCEPTION 'ERR_INVALID_MODE: p_mode debe ser preview o execute, got %', p_mode;
  END IF;

  -- Validate preview passed before executing
  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    UPDATE public.restore_sessions SET status = 'FAILED',
      failure_reason = 'Preview failed: tables in backup not in registry',
      failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED: % tables in backup not in registry: %',
      array_length(v_missing_tables, 1), v_missing_tables;
  END IF;

  IF v_tier_violations IS NOT NULL THEN
    UPDATE public.restore_sessions SET status = 'FAILED',
      failure_reason = 'Preview failed: tier violations detected',
      failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED: tier violations detected: %', v_tier_violations;
  END IF;

  IF v_source_of_truth_violations IS NOT NULL THEN
    UPDATE public.restore_sessions SET status = 'FAILED',
      failure_reason = 'Preview failed: source_of_truth invariants violated',
      failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED: source_of_truth invariants violated: %', v_source_of_truth_violations;
  END IF;

  -- ============================================================
  -- ACQUIRE LOCK: prevent concurrent restores on same store
  -- ============================================================
  v_lock_token := 'restore_store_' || p_store_id::text;
  -- pg_advisory_xact_lock locks until end of transaction
  -- We use hashtext to convert the token to int64 (Postgres advisory lock requires int64 or 2 int32)
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_token));
  v_lock_acquired := TRUE;

  UPDATE public.restore_sessions
  SET lock_acquired = TRUE, lock_token = v_lock_token,
      status = 'EXECUTING'
  WHERE id = v_session_id;

  -- ============================================================
  -- CREATE PRE-RESTORE SNAPSHOT (for disaster recovery)
  -- ============================================================
  SELECT jsonb_build_object(
    'snapshot_at', NOW(),
    'store_id', p_store_id,
    'table_counts', (
      SELECT jsonb_object_agg(tablename, n_live_tup)
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname IN (
          SELECT table_name FROM public.backup_table_registry WHERE excluded_from_restore = FALSE
        )
    ),
    'inventory_summary', (
      SELECT jsonb_build_object(
        'total_products', COUNT(*),
        'total_quantity', COALESCE(SUM(quantity), 0)
      )
      FROM public.inventory WHERE store_id = p_store_id
    )
  ) INTO v_pre_restore_snapshot;

  UPDATE public.restore_sessions
  SET pre_restore_snapshot = v_pre_restore_snapshot
  WHERE id = v_session_id;

  -- ============================================================
  -- SET restore_mode (bypass triggers)
  -- ============================================================
  SET LOCAL app.restore_mode = 'true';
  v_restore_mode_val := current_setting('app.restore_mode', true);
  IF v_restore_mode_val IS NULL OR v_restore_mode_val != 'true' THEN
    RAISE EXCEPTION 'ERR_RESTORE_MODE_NOT_SET: app.restore_mode no se pudo establecer';
  END IF;

  -- ============================================================
  -- DELETE existing data (in REVERSE tier order — children before parents)
  -- ============================================================
  -- Tables that are NEVER deleted (user instruction):
  --   - profiles (multi-store, belongs to auth.users)
  --   - user_store_memberships (M2M, handled separately)
  --   - tenants (system table)
  -- Tables that are excluded_from_restore (excluded=true) are also not deleted.

  FOR t IN SELECT table_name FROM unnest(v_active_registry_tables) AS table_name
           ORDER BY tier DESC, table_name DESC LOOP
    -- Skip tables we should never touch
    CONTINUE WHEN t.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    BEGIN
      IF t.table_name = 'stores' THEN
        -- stores row is UPDATEd later, not deleted
        CONTINUE;
      END IF;

      -- For via_origin_dest tables (transfers), delete rows where store is origin OR destination
      IF EXISTS (
        SELECT 1 FROM public.backup_table_registry
        WHERE table_name = t.table_name AND filter_strategy = 'via_origin_dest'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1', t.table_name)
        USING p_store_id;
      -- For via_entity_id tables (business_events)
      ELSIF EXISTS (
        SELECT 1 FROM public.backup_table_registry
        WHERE table_name = t.table_name AND filter_strategy = 'via_entity_id'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE entity_id = $1::text', t.table_name)
        USING p_store_id;
      -- For store_id tables
      ELSIF EXISTS (
        SELECT 1 FROM public.backup_table_registry
        WHERE table_name = t.table_name AND filter_strategy = 'store_id'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE store_id = $1', t.table_name)
        USING p_store_id;
      -- For via_parent tables, delete happens via CASCADE from parent DELETE
      -- (no explicit delete needed)
      END IF;

      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[t.table_name || '_delete_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_DELETE_FAILED: % - %', t.table_name, SQLERRM;
    END;
  END LOOP;

  -- ============================================================
  -- INSERT backup data (in tier order — parents before children)
  -- ============================================================
  FOR t IN SELECT table_name FROM unnest(v_active_registry_tables) AS table_name
           ORDER BY tier ASC, table_name ASC LOOP
    -- Skip tables we should never touch
    CONTINUE WHEN t.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    v_rows := p_backup_payload->'tables'->t.table_name;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) != 'array' OR jsonb_array_length(v_rows) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      IF t.table_name = 'stores' THEN
        -- For stores, UPDATE the existing row (don't INSERT)
        -- The backup should have exactly 1 row with id = p_store_id
        UPDATE public.stores SET
          name = (v_rows->0->>'name'),
          slug = (v_rows->0->>'slug'),
          -- ... other columns from backup
          updated_at = NOW()
        WHERE id = p_store_id;
      ELSE
        -- For all other tables, INSERT the rows from backup
        -- We use jsonb_populate_record with a generic approach
        -- Using EXECUTE format with the table name
        -- The rows are inserted as-is (no store_id rewrite since restore = same store)
        INSERT INTO public." || t.table_name || "
        SELECT * FROM jsonb_populate_record(NULL::public." || t.table_name || ", v_rows);
        -- Note: This requires the table to have a matching row type.
        -- For tables with generated columns (search_vector), we need to exclude them.
      END IF;

      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[t.table_name || '_insert_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_INSERT_FAILED: % - %', t.table_name, SQLERRM;
    END;
  END LOOP;

  -- ============================================================
  -- SYNC products.stock_current FROM inventory (final consistency)
  -- ============================================================
  -- After all inserts, ensure products.stock_current = inventory.quantity
  -- (because trg_sync_products_stock_current was bypassed during restore)
  UPDATE public.products p
  SET stock_current = i.quantity,
      updated_at = NOW()
  FROM public.inventory i
  WHERE i.product_id = p.id
    AND i.store_id = p.store_id
    AND p.store_id = p_store_id;

  -- ============================================================
  -- UNSET restore_mode (re-enable triggers)
  -- ============================================================
  SET LOCAL app.restore_mode = 'false';

  -- ============================================================
  -- VALIDATE POST-RESTORE
  -- ============================================================
  SELECT public.validate_post_restore(p_store_id, p_backup_payload) INTO v_post_restore_validation;

  -- If validation failed, raise exception (triggers ROLLBACK)
  IF (v_post_restore_validation->>'overall_status') != 'PASS' THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'Post-restore validation failed',
        post_restore_validation = v_post_restore_validation,
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_POST_RESTORE_VALIDATION_FAILED: %', v_post_restore_validation;
  END IF;

  -- ============================================================
  -- UPDATE SESSION with success
  -- ============================================================
  UPDATE public.restore_sessions
  SET status = 'COMPLETED',
      post_restore_validation = v_post_restore_validation,
      tables_processed = v_tables_processed,
      tables_failed = v_tables_failed,
      total_rows_processed = v_total_rows,
      completed_at = NOW()
  WHERE id = v_session_id;

  -- ============================================================
  -- RETURN success report
  -- ============================================================
  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'mode', 'execute',
    'target_store_id', p_store_id,
    'backup_store_id', v_backup_store_id,
    'status', 'COMPLETED',
    'tables_processed', v_tables_processed,
    'tables_failed', v_tables_failed,
    'total_rows_processed', v_total_rows,
    'validation', v_post_restore_validation
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Annotate the session with the failure
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = SQLERRM,
        failed_at = NOW()
    WHERE id = v_session_id;
    -- Re-raise to trigger ROLLBACK
    RAISE;
END;
$$;
```

### Notas importantes sobre la implementación

1. **`jsonb_populate_record`** requiere que el tipo de la tabla exista. Para tablas con columnas generadas (`search_vector` en `products`), PostgreSQL fallará. La implementación final necesita un helper que filtre las columnas generadas, o usar `INSERT ... SELECT ... FROM jsonb_to_record` con una lista de columnas explícita.

2. **`pg_advisory_xact_lock`** se libera automáticamente al final de la transacción (COMMIT o ROLLBACK).

3. **`SET LOCAL app.restore_mode = 'true'`** solo aplica dentro de la transacción actual. Las transacciones concurrentes no se ven afectadas.

4. **El bloque `EXCEPTION WHEN OTHERS THEN`** captura cualquier error, anota el fallo en `restore_sessions` y re-lanza la excepción para que PostgreSQL haga ROLLBACK de toda la transacción.

5. **Tablas intocables** (per instrucción del usuario): `profiles`, `user_store_memberships`, `tenants`. Estas tablas NO se eliminan ni se insertan durante el restore.

---

## Fase 3 — Plan de Pruebas PT-4 a PT-8

| Test | Descripción | Criterio de aprobación |
|------|-------------|------------------------|
| **PT-4** | Restore en tienda vacía | Backup restaurado 100% contra backup original. `validate_post_restore` returns `overall_status=PASS`. |
| **PT-5** | Fallo intencional en tabla intermedia | Insertar un backup con un FK inválido en `transaction_items` (referenciando un `transaction_id` que no existe en `transactions`). Confirmar que toda la transacción hace ROLLBACK, `restore_sessions.status=FAILED`, y `pre_restore_snapshot` está disponible. |
| **PT-6** | No duplicación de kardex ni stock_movements | Después del restore, comparar `COUNT(*)` de `kardex_entries` y `stock_movements` con los conteos del backup. Deben ser idénticos (no duplicados). |
| **PT-7** | Validación post-restore completa | Ejecutar `validate_post_restore()` y verificar: `inventory_matches_backup=PASS`, `products_stock_current_consistency=PASS`, `inventory_movements_legacy_discrepancies=WARN` (esperado). |
| **PT-8** | Inventory mantiene la fuente primaria | Después del restore, los 4 productos legacy de Puerto Padre (1051, 1996, 106, 999) deben mantener sus valores exactos. NO se reconstruyeron desde `stock_movements`. |

---

## Archivos a producir

1. **`supabase/migrations/20260802000007_v2_12_46_restore_rpc_preview.sql`** (Fase 1)
   - `validate_post_restore()` ampliado
   - `restore_store_backup(mode='preview')` — sin escritura destructiva

2. **`supabase/migrations/20260802000008_v2_12_47_restore_rpc_execute.sql`** (Fase 2)
   - Modificación de 9 funciones trigger con bypass `restore_mode`
   - `restore_store_backup(mode='execute')` — transaccional con rollback

3. **`scripts/run_pt4_pt8.py`** (Fase 3)
   - Ejecutor de pruebas PT-4 a PT-8

---

## Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `jsonb_populate_record` falla con columnas generadas | Alta | Medio | Helper que filtra `GENERATED ALWAYS AS STORED` columns |
| `restore_mode` no se respeta en un trigger | Baja | Alto | `validate_post_restore` detecta inconsistencias y dispara ROLLBACK |
| Snapshot previo muy grande (>100MB) | Media | Bajo | Si >100MB, mover a Supabase Storage y guardar URL en `restore_sessions.pre_restore_snapshot` como `{"storage_url": "..."}` |
| Concurrencia: dos restores en paralelo | Baja | Alto | `pg_advisory_xact_lock` bloquea el segundo |
| Falla a mitad del INSERT | Media | Crítico | `EXCEPTION WHEN OTHERS THEN` + ROLLBACK transaccional |

---

## Aprobación requerida

Este diseño queda pendiente de tu aprobación antes de aplicar nada. Preguntas específicas:

1. ¿Apruebas el enfoque de 2 migraciones separadas (Fase 1 + Fase 2) o prefieres 1 sola?
2. ¿Quieres que filtre las columnas generadas (`search_vector`) automáticamente, o prefieres una lista hardcodeada como en el `backup-service.ts` actual?
3. ¿El snapshot previo debe ser completo (todas las tablas) o solo conteos + inventory? (impacto en tamaño)
4. ¿Apruebas que el restore en `execute` mode haga `DELETE FROM ... WHERE store_id=X` en todas las tablas (excepto `profiles`, `user_store_memberships`, `tenants`)?

**Espero tu aprobación antes de aplicar.**
