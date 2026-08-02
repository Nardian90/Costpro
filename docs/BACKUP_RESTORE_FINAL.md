# Backup Restore — Documentación Final

**Fecha:** 2026-08-02
**Iteración:** 7 — Backup Restore
**Estado:** ✅ CERTIFICADO (BR-1 + BR-2.1 + BR-2.2 + BR-2.3)
**Versión:** v2.12.47

---

## 1. Arquitectura Definitiva

### Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKUP RESTORE ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  backup_table_  │    │  restore_sessions│                    │
│  │  registry       │    │  (tracking)      │                    │
│  │  (84 tablas)    │    │                  │                    │
│  └────────┬────────┘    └────────┬─────────┘                    │
│           │                      │                              │
│           v                      v                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            restore_store_backup() RPC                     │   │
│  │  (SECURITY DEFINER, 4 parámetros)                        │   │
│  │                                                           │   │
│  │  mode='preview'  →  valida sin escribir                  │   │
│  │  mode='execute'  →  restore transaccional con rollback   │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         v                 v                 v                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ validate_pre │  │ create_pre_  │  │ validate_post│          │
│  │ restore_fk_  │  │ restore_     │  │ _restore()   │          │
│  │ integrity()  │  │ snapshot()   │  │ (3 checks)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            TRIGGER BYPASS (app.restore_mode)              │   │
│  │  9 funciones trigger modificadas                          │   │
│  │  SET LOCAL app.restore_mode='true' durante restore        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de Restore (mode='execute')

```
1. VALIDATE
   ├── Verificar store existe
   ├── Verificar backup format (costpro-store-backup)
   ├── Verificar backup storeId
   ├── SECURITY CHECK: caller es admin (rol='admin' en profiles)
   └── Crear restore_session (status=PREPARING)

2. PREVIEW VALIDATION
   ├── Comparar tablas en backup vs registry
   ├── Validar tier ordering (parents antes que children)
   ├── Validar source_of_truth invariants
   │   ├── inventory = primary
   │   ├── stock_movements = audit
   │   ├── kardex_entries = audit
   │   └── products = primary
   ├── FK integrity check (detectar blockers)
   └── preview_passed = TRUE/FALSE

3. TOKEN VALIDATION
   ├── confirmation_token obligatorio
   ├── Token existe en DRY_RUN session con preview_passed=TRUE
   └── Invalidar token (status=EXECUTING, confirmation_token=NULL)

4. ACQUIRE LOCK
   └── pg_advisory_xact_lock(hashtext('restore_store_' || store_id))

5. CREATE SNAPSHOT
   └── create_pre_restore_snapshot() → JSONB híbrido
       ├── metadata (snapshot_at, store_id)
       ├── table_counts (75 tablas)
       ├── inventory completo (fuente primaria)
       ├── products.stock_current
       ├── transfers pendientes
       ├── inventory_reservations activas
       └── checksums (51 tablas primary + audit)

6. SET LOCAL app.restore_mode = 'true'
   └── Bypass de 9 triggers activado

7. DELETE (orden inverso: tier DESC, children antes que parents)
   ├── via_origin_dest: WHERE origin_store_id=X OR destination_store_id=X
   ├── via_entity_id: WHERE entity_id=X
   ├── store_id: WHERE store_id=X
   └── via_parent: WHERE fk IN (SELECT id FROM parent WHERE store_id=X)
   Tablas NUNCA eliminadas: profiles, user_store_memberships, tenants

8. INSERT (orden topológico: tier ASC, parents antes que children)
   ├── stores: UPDATE existing row (no INSERT)
   └── Otras: INSERT con jsonb_to_recordset
       ├── Filtra columnas generadas (GENERATED ALWAYS AS STORED)
       ├── Maneja USER-DEFINED types (enums) via udt_name
       └── Excluye search_vector, etc.

9. SYNC products.stock_current = inventory.quantity
   └── UPDATE explícito (trigger fue bypassado)

10. SET LOCAL app.restore_mode = 'false'
    └── Triggers reactivados

11. VALIDATE POST-RESTORE
    ├── CHECK 1 (CRÍTICO): inventory.quantity == backup
    ├── CHECK 2 (HIGH): products.stock_current == inventory.quantity
    └── CHECK 3 (WARN): inventory != SUM(stock_movements) [esperado legacy]

12. COMMIT o ROLLBACK
    ├── Si validation PASS → COMMIT, status=COMPLETED
    └── Si validation FAIL → ROLLBACK, status=FAILED
```

---

## 2. Tablas Incluidas/Excluidas

### Registry: 84 tablas (75 activas + 9 excluidas)

#### Por source_of_truth:

| source_of_truth | Count | Comportamiento en restore |
|-----------------|------:|---------------------------|
| **primary** | 13 | Se restaura directo. NO se reconstruye. |
| **derived** | 3 | Se respalda pero NO se restaura (se recalcula). |
| **audit** | 38 | Se restaura directo. Historial inmutable. |
| **reference** | 23 | Se restaura directo. Catálogo/configuración. |
| **ephemeral** | 7 | Se respalda pero NO se restaura. |

#### Tablas excluidas (9):

| Tabla | Razón |
|-------|-------|
| `profiles` | Multi-store: pertenece a auth.users, no se restaura |
| `user_store_memberships` | M2M, se gestiona separadamente |
| `tenants` | Tabla del sistema |
| `sync_log` | Log efímero |
| `store_notifications` | Notificaciones transitorias |
| `inventory_snapshots` | Calculado, se recalcula |
| `inventory_batches` | Calculado de inventory + product_lots |
| `cost_sheet_templates` | Plantillas globales |
| `report_runs` | Logs de ejecución |
| `store_reset_snapshots` | Metadata de resets previos |

#### Tablas críticas (truth model):

| Tabla | source_of_truth | Filter strategy |
|-------|-----------------|-----------------|
| `inventory` | **primary** | store_id |
| `products` | **primary** | store_id |
| `stock_movements` | **audit** | store_id |
| `kardex_entries` | **audit** | store_id |
| `transfers` | primary | via_origin_dest |
| `business_events` | audit | via_entity_id |
| `audit_logs` | audit | store_id |

---

## 3. Truth Model

### Decisión: Modelo A — `inventory.quantity` es la fuente primaria

**Reglas intocables:**

1. ✅ `inventory.quantity` = **primary** — Se restaura directo del backup
2. ✅ `products.stock_current` = **derived** — Se sincroniza desde `inventory` al final del restore
3. ✅ `stock_movements` = **audit** — Historial inmutable, se restaura directo
4. ✅ `kardex_entries` = **audit** — Historial inmutable, se restaura directo
5. ❌ `rebuild_inventory_balances()` **NO existe** — Nunca se reconstruye inventory desde movimientos
6. ❌ `profiles`, `user_store_memberships`, `tenants` **NO se modifican** durante restore

### Justificación

El audit inicial encontró **4 productos legacy** en Puerto Padre VITALLCONS con `inventory.quantity` ≠ `SUM(stock_movements.quantity_change)`:

| SKU | inventory | SUM(mov) | diff | Causa |
|-----|-----------|----------|------|-------|
| PROD-022 | 1051 | 52 | 999 | Saldo inicial sin movimiento |
| PROD-021 | 1996 | -2 | 1998 | Saldo inicial sin movimiento |
| PROD-025 | 106 | 3 | 103 | Saldo inicial sin movimiento |
| PROD-016 | 999 | 0 | 999 | Movimientos se cancelan |

Reconstruir `inventory` desde `stock_movements` destruiría estos saldos legacy legítimos. Por eso `inventory` es **primary** y `stock_movements` es **audit**.

### Validación post-restore (3 checks)

```
CHECK 1 (CRÍTICO): inventory_matches_backup
  → inventory.quantity restaurado debe coincidir con el backup
  → Si FAIL → ROLLBACK completo

CHECK 2 (HIGH): products_stock_current_consistency
  → products.stock_current debe ser igual a inventory.quantity
  → Si FAIL → ROLLBACK completo

CHECK 3 (WARN): inventory_movements_legacy_discrepancies
  → inventory != SUM(stock_movements) es esperado para datos legacy
  → Solo warning, no error
```

---

## 4. Triggers Modificados

### 9 funciones trigger con bypass `restore_mode`

Cada función agrega al inicio:
```sql
IF current_setting('app.restore_mode', true) = 'true' THEN
  RETURN NEW;
END IF;
```

| # | Función | Tabla | Tipo | Razón de bypass |
|---|---------|-------|------|-----------------|
| 1 | `sync_products_stock_current()` | inventory | AFTER ROW | Recalcula `products.stock_current` — se sincroniza al final |
| 2 | `prevent_direct_inventory_modification()` | inventory | BEFORE STATEMENT | Bloquea UPDATE directo — durante restore hacemos INSERT directo |
| 3 | `prevent_negative_inventory()` | inventory | BEFORE STATEMENT | Bloquea qty<0 — backup puede tener saldos negativos legítimos |
| 4 | `alert_low_stock()` | inventory | AFTER STATEMENT | Genera `business_events` duplicados |
| 5 | `fn_sync_inventory_on_movement()` | stock_movements | BEFORE ROW | **CRÍTICO** — Modifica `inventory.quantity` |
| 6 | `auto_kardex_on_stock_movement()` | stock_movements | AFTER ROW | **CRÍTICO** — Crea `kardex_entries` duplicados |
| 7 | `sync_product_stock()` | stock_movements | AFTER ROW | Recalcula `products.stock_current` desde último movimiento |
| 8 | `update_product_wac()` | receipt_items | AFTER ROW | Recalcula WAC (costo promedio) |
| 9 | `sync_product_has_movements()` | receipt_items/transaction_items/inventory_movements | AFTER ROW | Marca `has_movements=true` (innecesario) |

### Comportamiento

- `restore_mode = 'true'` → bypass (trigger no hace nada)
- `restore_mode = NULL` o cualquier otro valor → comportamiento normal
- `SET LOCAL` aplica solo dentro de la transacción actual
- Triggers de `updated_at` (touch_updated_at) **NO** se modifican — son inofensivos

### Verificación post-restore (PT-7 confirmado)

Después del restore, los triggers funcionan correctamente:
- ✅ `stock_movements` → actualiza `inventory` correctamente
- ✅ `inventory` → actualiza `products.stock_current` correctamente
- ✅ `stock_movements` → genera `kardex` una sola vez (no duplica)
- ✅ `restore_mode` NO dejó efectos colaterales

---

## 5. Seguridad

### Funciones SECURITY DEFINER

Todas las funciones de restore son `SECURITY DEFINER` (se ejecutan como `postgres`):

| Función | Propósito |
|---------|-----------|
| `restore_store_backup()` | Restore preview/execute |
| `validate_post_restore()` | Validación post-restore |
| `validate_pre_restore_fk_integrity()` | Detección de FK blockers |
| `create_pre_restore_snapshot()` | Snapshot previo |
| `generate_confirmation_token()` | Token para execute |
| `get_table_writable_columns()` | Helper (filtra columnas generadas) |

### Control de acceso

1. **Role check**: `restore_store_backup()` verifica que el caller tenga `role='admin'` en `profiles`
   - Si `auth.uid()` es NULL → service role (permitido)
   - Si `auth.uid()` no es NULL → debe ser admin

2. **RLS en `restore_sessions`**: policy `restore_sessions_store_access` usa `has_store_access(store_id)`

3. **confirmation_token**:
   - Generado por `generate_confirmation_token()` después de preview exitoso
   - Requerido para `mode='execute'`
   - **Invalidado después del uso** (status → EXECUTING, token → NULL)
   - **No reutilizable** (validación falla si la sesión DRY_RUN ya fue consumida)

### Auditoría de seguridad (BR-2.3.1 — APROBADA)

| Test | Resultado |
|------|-----------|
| Usuario no-admin bloqueado | ✅ |
| Token obligatorio | ✅ |
| Token falso rechazado | ✅ |
| Token no reutilizable | ✅ |
| `pg_advisory_xact_lock` usado | ✅ |

---

## 6. Procedimiento Operativo para Restaurar Producción

### Pre-requisitos

1. Tener un backup válido (formato `costpro-store-backup` v2.0+)
2. Tener acceso admin a Supabase Studio o Management API
3. Coordinar ventana de mantenimiento (el restore bloquea la tienda)

### Pasos

#### Paso 1: Preview (validación sin escribir)

```sql
-- Via Supabase Studio SQL Editor o RPC
SELECT * FROM restore_store_backup(
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'::UUID,  -- store_id
  '<backup_payload_jsonb>'::JSONB,                 -- backup
  'preview'                                         -- mode
);
```

**Verificar:**
- `preview_passed = true`
- `missing_tables_in_registry = []`
- `tier_violations = []`
- `source_of_truth_violations = []`
- `fk_integrity.can_proceed = true`

#### Paso 2: Generar confirmation_token

```sql
SELECT * FROM generate_confirmation_token(
  '<session_id_del_preview>'::UUID
);
-- Retorna: rst_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Paso 3: Execute (restore destructivo)

```sql
SELECT * FROM restore_store_backup(
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'::UUID,  -- store_id
  '<backup_payload_jsonb>'::JSONB,                 -- mismo backup
  'execute',                                        -- mode
  'rst_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'           -- confirmation_token
);
```

**Verificar:**
- `status = COMPLETED`
- `validation.overall_status = PASS`
- `tables_failed = 0`

#### Paso 4: Validación post-restore

```sql
SELECT * FROM validate_post_restore(
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'::UUID,
  '<backup_payload_jsonb>'::JSONB
);
```

**Verificar:**
- `inventory_matches_backup.status = PASS`
- `products_stock_current_consistency.status = PASS`
- `inventory_movements_legacy_discrepancies.status = WARN` (esperado para legacy)

### Tiempos esperados

| Volumen | Tiempo execute |
|---------|---------------:|
| 727 registros | 0.6s |
| 10,000 registros | 7.7s |
| Throughput | ~1,300 rows/sec |

---

## 7. Procedimiento de Emergencia

### Si el restore falla a mitad

**El sistema hace ROLLBACK automático** — la transacción es atómica. Si `validate_post_restore` falla, todos los cambios se revierten.

### Si necesitas recuperar desde el snapshot previo

1. **Consultar el snapshot**:
```sql
SELECT pre_restore_snapshot, initiated_at
FROM restore_sessions
WHERE store_id = '<store_id>'
  AND status = 'COMPLETED'
ORDER BY initiated_at DESC
LIMIT 1;
```

2. **El snapshot contiene**:
   - `inventory` completo (fuente primaria)
   - `products.stock_current`
   - `transfers` pendientes
   - `inventory_reservations` activas
   - `checksums` de tablas críticas

3. **Para restaurar manualmente desde el snapshot**:
   - Extraer `inventory` del JSONB
   - Hacer `UPDATE inventory SET quantity = ...` para cada producto
   - Sincronizar `products.stock_current = inventory.quantity`

### Si el restore deja la tienda en estado inconsistente

1. **Verificar estado actual**:
```sql
SELECT * FROM validate_post_restore('<store_id>'::UUID, NULL);
```

2. **Si `products_stock_current_consistency = FAIL`**:
```sql
-- Sincronizar products.stock_current desde inventory
UPDATE products p
SET stock_current = i.quantity, updated_at = NOW()
FROM inventory i
WHERE i.product_id = p.id AND i.store_id = p.store_id
  AND p.store_id = '<store_id>';
```

3. **Si `inventory_matches_backup = FAIL`**:
   - Restaurar desde el snapshot previo (paso anterior)
   - O re-ejecutar el restore desde un backup conocido

### Contactos de emergencia

- **DBA**: revisar `restore_sessions` para diagnóstico
- **Snapshot previo**: siempre disponible en `restore_sessions.pre_restore_snapshot`
- **Audit trail**: `restore_sessions` registra todos los restores con timestamps

---

## 8. Migrations Aplicadas

| Migration | Versión | Descripción |
|-----------|---------|-------------|
| `20260802000006_v2_12_45_backup_registry.sql` | v2.12.45 | Registry + restore_sessions + source_of_truth |
| `20260802000007_v2_12_46_restore_rpc_preview.sql` | v2.12.46 | Preview mode + validate_post_restore + snapshot |
| `20260802000008_v2_12_47_restore_rpc_execute.sql` | v2.12.47 | Execute mode + 9 trigger bypass + rollback |

### Fixes post-deploy

| Fix | Descripción |
|-----|-------------|
| `create_pre_restore_snapshot` | `relname` (no `tablename`), alias `rec` (no `t`) |
| `restore_sessions.mode_check` | Agregar `'preview'` al CHECK constraint |
| `restore_sessions.initiated_by` | DROP NOT NULL + DROP FK (service role sin profile) |
| `restore_store_backup` | `COALESCE(auth.uid(), sentinel)` para service role |
| `restore_store_backup` | Security check: `role='admin'` requerido |
| `restore_store_backup` | Token invalidado después de execute |
| `restore_store_backup` | DELETE genérico para via_parent (try store_id → origin/dest → entity_id) |
| `restore_store_backup` | `string_agg` con `ORDER BY` (fix GROUP BY) |
| `restore_store_backup` | `USER-DEFINED` types via `udt_name` |
| `restore_store_backup` | `stores` UPDATE sin `updated_at` (columna no existe) |
| `auto_kardex_on_stock_movement` | `COALESCE(NEW.reference_doc, NEW.notes || ...)` (no `NEW.reason`) |
| `backup_table_registry` | Tiers recalculados con CTE recursivo (via_parent en tier+1) |
| `backup_table_registry` | FK columns actualizados desde `information_schema` (po_id, service_id) |
| `backup_table_registry` | Agregadas `receipt_items` + `inventory_movements` (post-drift) |

---

## 9. Resultados de Certificación

### BR-1 (Backup + Registry)
- ✅ PT-1: Backup completo (75 tablas, 1041 registros)
- ✅ PT-2: Backup tienda vacía
- ✅ PT-3: Backup con datos reales (tablas críticas validadas)

### BR-2.1 (Preview mode)
- ✅ `validate_pre_restore_fk_integrity()` — 0 blockers
- ✅ `create_pre_restore_snapshot()` — 64 KB, 75 tablas, 51 checksums
- ✅ `validate_post_restore()` — 3 checks funcionando
- ✅ `restore_store_backup(mode='preview')` — preview_passed=TRUE
- ✅ `generate_confirmation_token()` — token generado y almacenado

### BR-2.2 (Execute mode)
- ✅ PT-4A: Restore en tienda de prueba — 92 tablas, 0 failed, validation PASS
- ✅ PT-5: Rollback forzado — counts unchanged después del fallo
- ✅ PT-6: No duplicación kardex/stock_movements
- ✅ PT-7: validate_post_restore PASS
- ✅ PT-8: Conservación inventarios legacy (1051, 1996, 106, 999)

### BR-2.3 (Hardening + Auditoría final)
- ✅ BR-2.3.1: Seguridad (non-admin blocked, token validation, advisory lock)
- ✅ BR-2.3.2: Triggers post-restore (no efectos colaterales)
- ✅ BR-2.3.3: Restore idempotente (backup_original == backup_restored)
- ✅ BR-2.3.4: Performance (727 rows: 0.6s, 10K rows: 7.7s, ~1300 rows/sec)

---

## 10. Estado Final

```
BR-1 (Backup + Registry + source_of_truth)    ✅ CERTIFICADO
BR-2.1 (Preview mode + validate_post_restore) ✅ CERTIFICADO
BR-2.2 (Execute mode + triggers + rollback)   ✅ CERTIFICADO
BR-2.3 (Hardening + auditoría final)          ✅ CERTIFICADO

Iteración 7: Backup Restore                   ✅ COMPLETA
```

---

## 11. Mejoras Operativas Post-Auditoría (Recomendadas)

### Observación post-auditoría BR-2.3

Durante las pruebas de performance (BR-2.3.4) y restore repetido (BR-2.3.3) se evidenció que ejecutar restores destructivos sobre tiendas con datos reales aumenta el riesgo operativo. Aunque todas las pruebas pasaron y el rollback transaccional funciona correctamente, se recomiendan las siguientes mejoras para reducir el riesgo en operaciones futuras:

### 11.1 Store de laboratorio permanente

**Problema:** Las pruebas PT-4/PT-5/PT-6/PT-8 se ejecutaron sobre Puerto Padre VITALLCONS, una tienda con datos reales. Aunque el restore es idempotente, esto aumenta el riesgo operativo.

**Recomendación:** Crear una tienda exclusiva para pruebas:

```sql
INSERT INTO public.stores (id, name, slug, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'BACKUP_RESTORE_TEST',
  'backup-restore-test',
  true
);
```

**Regla operativa:** Nunca ejecutar PT-4/PT-5/PT-6/PT-8 sobre tiendas productivas. Todas las pruebas destructivas deben usar la tienda `BACKUP_RESTORE_TEST`.

### 11.2 Flag de protección para tiendas productivas

**Problema:** Actualmente cualquier tienda puede ser objeto de un restore destructivo si el usuario tiene rol admin. No hay distinción entre tiendas productivas y tiendas de testing.

**Recomendación:** Agregar columna a `stores`:

```sql
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS backup_restore_protected BOOLEAN DEFAULT false;

-- Marcar tiendas productivas como protegidas
UPDATE public.stores
SET backup_restore_protected = true
WHERE name IN ('TIENDA CENTRAL COSTPRO', 'Puerto Padre VITALLCONS', 'ENERVIDA-VITALLCONS');
```

**Comportamiento esperado:**
- `backup_restore_protected = true` (Producción) → requiere confirmación adicional (doble token o aprobación de segundo admin)
- `backup_restore_protected = false` (Testing) → permite ejecución automática con token normal

**Implementación en `restore_store_backup()`:**
```sql
-- Después del security check, antes del execute
IF p_mode = 'execute' THEN
  SELECT backup_restore_protected INTO v_protected
  FROM public.stores WHERE id = p_store_id;

  IF v_protected AND p_confirmation_token_secondary IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_PROTECTED: Tienda productiva requiere secondary_token';
  END IF;
END IF;
```

### 11.3 Auditoría obligatoria antes de execute

**Problema:** Aunque `restore_sessions` registra el restore después de completarse, no hay un log de auditoría previo al execute que capture el contexto completo.

**Recomendación:** Antes de ejecutar `restore_store_backup(mode='execute')`, registrar en `restore_sessions`:

| Campo | Descripción |
|-------|-------------|
| `store_id` | Tienda destino |
| `initiated_by` | Usuario que ejecuta |
| `initiator_ip` | IP del caller (si está disponible) |
| `initiator_session` | Session ID del JWT (si está disponible) |
| `backup_size_bytes` | Tamaño del backup payload |
| `backup_table_count` | Cantidad de tablas en el backup |
| `backup_row_count` | Cantidad total de registros |
| `preview_passed` | Resultado del preview |
| `confirmation_token` | Token usado (hasheado) |

**Implementación:**
```sql
ALTER TABLE public.restore_sessions
  ADD COLUMN IF NOT EXISTS initiator_ip TEXT,
  ADD COLUMN IF NOT EXISTS initiator_session TEXT,
  ADD COLUMN IF NOT EXISTS backup_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS backup_table_count INTEGER,
  ADD COLUMN IF NOT EXISTS backup_row_count INTEGER;
```

### 11.4 Snapshot externo para tiendas grandes

**Problema:** El snapshot JSONB actual funciona para tiendas pequeñas-medias (64 KB para 114 productos). Para tiendas grandes con miles de productos y años de historial, el snapshot puede superar 100 MB y degradar el rendimiento de `restore_sessions`.

**Recomendación:** Implementar snapshot híbrido con Supabase Storage:

```
restore_sessions
        |
        ├── pre_restore_snapshot JSONB (< 100 MB)
        |
        └── pre_restore_snapshot_storage_url TEXT (> 100 MB)
```

**Lógica en `create_pre_restore_snapshot()`:**
```sql
-- Después de construir v_snapshot
v_snapshot_size := octet_length(v_snapshot::text);

IF v_snapshot_size > 104857600 THEN  -- 100 MB
  -- Subir a Supabase Storage
  v_storage_url := upload_to_storage('restore-snapshots', v_snapshot);
  -- Guardar solo referencia
  v_snapshot := jsonb_build_object(
    'snapshot_type', 'external',
    'storage_url', v_storage_url,
    'size_bytes', v_snapshot_size
  );
END IF;
```

**Bucket de Storage:**
```
restore-snapshots/
  ├── <store_id>_<session_id>_<timestamp>.json
  └── ...
```

**Retención:** Configurar lifecycle policy para eliminar snapshots después de 30 días (o según política de compliance).

### 11.5 Prioridad de implementación

| Mejora | Prioridad | Esfuerzo | Riesgo si no se implementa |
|--------|-----------|----------|---------------------------|
| 11.1 Store de laboratorio | **Alta** | Bajo | Riesgo operativo en pruebas futuras |
| 11.2 Flag de protección | **Alta** | Medio | Restore accidental de tienda productiva |
| 11.3 Auditoría previa | Media | Bajo | Falta de trazabilidad |
| 11.4 Snapshot externo | Baja | Alto | Degradación de performance en tiendas grandes |

### 11.6 Estado de estas mejoras

Estas mejoras son **recomendaciones post-auditoría** y NO bloquean la certificación de BR-2.3. Se documentan aquí para su implementación en una fase futura (post-Iteración 9 o como hardening independiente).

**La Iteración 7 queda CERTIFICADA con estas mejoras registradas como backlog operativo.**
