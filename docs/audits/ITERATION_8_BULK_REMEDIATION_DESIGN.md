# Iteración 8 — Bulk Store Operations Remediation Design

**Fecha:** 2026-08-02
**Iteración:** 8 — Bulk Store Operations
**Fase:** Diseño de remediación (pendiente aprobación del usuario)
**Scope:** Fase 1 — Corregir riesgos críticos (H-08-02, H-08-03, H-08-04, H-08-08, H-08-10)

---

## 1. Resumen Ejecutivo

Este documento presenta el diseño final para remediar 5 hallazgos críticos de la auditoría de Bulk Store Operations. **No se aplican migrations** hasta aprobación del usuario.

### Hallazgos a remediar (Fase 1)

| ID | Hallazgo | Solución propuesta |
|----|----------|-------------------|
| H-08-02 | Rate limit por hora no se aplica | Implementar `checkBulkOpsHourlyLimit()` + tabla `bulk_ops_log` |
| H-08-03 | `soft_delete_store` no valida dependencias | Ampliar `validate_store_can_be_modified()` con 2 checks adicionales |
| H-08-04 | Bulk delete no es atómico | Crear RPC `bulk_soft_delete_stores()` transaccional |
| H-08-08 | No hay auditoría previa al execute | Insertar `audit_logs` antes del execute + columnas en `restore_sessions` |
| H-08-10 | Confirmación UI "BULK" no se valida server-side | Schema requiere `confirmation_text='BULK_DELETE'` + `confirmation_token` |

### Fase 2 (diferida, no incluida en este diseño)

- Bulk archive / bulk restore
- Bulk create stores

---

## 2. Arquitectura Propuesta

### 2.1 Flujo end-to-end de bulk delete

```
Usuario admin selecciona N tiendas en UI
        │
        ▼
[1] POST /api/stores/bulk/preview
    Body: { storeIds, action: 'delete' }
    ─ Valida canManageStore por storeId
    ─ Llama validate_store_can_be_modified() por tienda
    ─ Retorna: { preview, blockers[], can_proceed }
        │
        ▼
[2] Usuario confirma escribiendo "BULK_DELETE"
    + ingresa motivo obligatorio
        │
        ▼
[3] POST /api/stores/bulk/execute
    Body: { storeIds, action: 'delete',
            confirmation_text: 'BULK_DELETE',
            reason: 'motivo del admin' }
    ─ Valida confirmation_text === 'BULK_DELETE'
    ─ Valida reason no vacío
    ─ Valida rate limit por hora (H-08-02)
    ─ Genera confirmation_token server-side
    ─ Inserta audit_log previo (H-08-08)
    ─ Llama RPC bulk_soft_delete_stores() (H-08-04)
        │
        ▼
[4] RPC bulk_soft_delete_stores(p_store_ids, p_deleted_by, p_confirmation_token, p_reason)
    ─ Fase VALIDATE: validar todas las tiendas antes de modificar
      (usando validate_store_can_be_modified ampliado — H-08-03)
    ─ Si alguna falla → RAISE EXCEPTION → ROLLBACK completo
    ─ Fase EXECUTE: soft_delete_store() por tienda en loop
    ─ Retorna JSON con resultado por tienda
        │
        ▼
[5] Handler recibe resultado
    ─ Si status=COMPLETED → 200 OK con detalles
    ─ Si status=FAILED → 409 Conflict con errors[]
    ─ Inserta audit_log de completion
```

### 2.2 Componentes nuevos

| Componente | Tipo | Propósito |
|------------|------|-----------|
| `bulk_soft_delete_stores()` | RPC (SECURITY DEFINER) | Bulk delete atómico con validación previa |
| `validate_store_can_be_modified()` | RPC (ampliar existente) | Agregar checks: inventory_reservations, purchase_orders |
| `bulk_ops_log` | Tabla | Tracking de bulk ops por hora para rate limiting |
| `generate_bulk_confirmation_token()` | RPC | Token server-side para bulk delete |
| `POST /api/stores/bulk/preview` | API route | Preview con validación de dependencias |
| `POST /api/stores/bulk/execute` | API route | Execute con confirmación + token + auditoría |

### 2.3 Componentes modificados

| Componente | Cambio |
|------------|--------|
| `POST /api/stores/bulk` (actual) | Deprecar en favor de /preview + /execute |
| `validate_store_can_be_modified()` | Agregar 2 checks: inventory_reservations ACTIVE, purchase_orders abiertas |
| `src/lib/rate-limit/tenant-limiter.ts` | Implementar `checkBulkOpsHourlyLimit()` |
| `bulkActionSchema` (Zod) | Agregar `confirmation_text`, `reason`, `confirmation_token` |
| `useBulkStoreAction` (hook) | Soportar flujo preview → execute |
| `StoresManagementView` | UI de confirmación mejorada (BULK_DELETE + motivo) |

---

## 3. RPCs Nuevas

### 3.1 `bulk_soft_delete_stores(p_store_ids, p_deleted_by, p_confirmation_token, p_reason)`

```sql
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_stores(
  p_store_ids UUID[],
  p_deleted_by UUID,
  p_confirmation_token TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_validation JSONB;
  v_blockers JSONB;
  v_errors JSONB[] := '{}'::jsonb[];
  v_processed INTEGER := 0;
  v_result JSONB;
  v_token_valid BOOLEAN;
BEGIN
  -- ============================================================
  -- 1. VALIDATE confirmation_token (server-side generated)
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.bulk_confirmation_tokens
    WHERE token = p_confirmation_token
      AND store_ids = p_store_ids
      AND action = 'delete'
      AND expires_at > NOW()
      AND consumed_at IS NULL
  ) INTO v_token_valid;

  IF NOT v_token_valid THEN
    RAISE EXCEPTION 'ERR_INVALID_CONFIRMATION_TOKEN: Token inválido, expirado o ya usado';
  END IF;

  -- Consume token (prevent reuse)
  UPDATE public.bulk_confirmation_tokens
  SET consumed_at = NOW()
  WHERE token = p_confirmation_token;

  -- ============================================================
  -- 2. VALIDATE: todas las tiendas pasan validaciones antes de modificar
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    -- Verificar que la tienda existe y está activa
    IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id = v_store_id AND is_active = true) THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id,
        'reason', 'STORE_NOT_FOUND_OR_INACTIVE'
      ));
      CONTINUE;
    END IF;

    -- Validar dependencias (H-08-03)
    SELECT public.validate_store_can_be_modified(v_store_id, 'soft_delete') INTO v_validation;
    v_blockers := v_validation->'blockers';

    IF v_validation->>'can_modify' != 'true' THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id,
        'reason', 'HAS_BLOCKING_DEPENDENCIES',
        'blockers', v_blockers
      ));
    END IF;
  END LOOP;

  -- Si alguna tienda tiene errores, NO modificar nada (atomicidad)
  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'FAILED',
      'processed', 0,
      'total_requested', array_length(p_store_ids, 1),
      'errors', to_jsonb(v_errors)
    );
  END IF;

  -- ============================================================
  -- 3. EXECUTE: todas las validaciones pasaron, ahora soft-delete
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    -- Llamar soft_delete_store (atomic dentro de esta transacción)
    PERFORM public.soft_delete_store(v_store_id, p_deleted_by);
    v_processed := v_processed + 1;
  END LOOP;

  -- ============================================================
  -- 4. AUDIT: registrar resultado
  -- ============================================================
  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_store_deleted',
    'stores',
    NULL,
    jsonb_build_object(
      'store_ids', p_store_ids,
      'deleted_by', p_deleted_by,
      'reason', p_reason,
      'processed', v_processed,
      'deleted_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'COMPLETED',
    'processed', v_processed,
    'total_requested', array_length(p_store_ids, 1),
    'errors', '[]'::jsonb
  );
END;
$$;
```

### 3.2 `generate_bulk_confirmation_token(p_store_ids, p_action, p_user_id)`

```sql
CREATE OR REPLACE FUNCTION public.generate_bulk_confirmation_token(
  p_store_ids UUID[],
  p_action TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Solo para acciones destructivas
  IF p_action != 'delete' THEN
    RAISE EXCEPTION 'ERR_NON_DESTRUCTIVE_ACTION: Token solo requerido para delete';
  END IF;

  -- Generar token criptográfico
  v_token := 'bct_' || replace(gen_random_uuid()::text, '-', '');

  -- Insertar con expiración de 10 minutos
  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at
  ) VALUES (
    v_token, p_store_ids, p_action, p_user_id, NOW() + INTERVAL '10 minutes'
  );

  RETURN v_token;
END;
$$;
```

### 3.3 `validate_store_can_be_modified()` — Ampliación

Agregar 2 checks adicionales al final (antes del RETURN):

```sql
  -- NUEVO: Reservas de inventario activas
  SELECT COUNT(*) INTO v_active_reservations
  FROM inventory_reservations
  WHERE store_id = p_store_id
    AND status = 'ACTIVE';

  IF v_active_reservations > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'active_inventory_reservations',
      'count', v_active_reservations,
      'message', format('Hay %s reservas de inventario activas', v_active_reservations)
    ));
  END IF;

  -- NUEVO: Órdenes de compra abiertas
  SELECT COUNT(*) INTO v_open_purchase_orders
  FROM purchase_orders
  WHERE store_id = p_store_id
    AND status IN ('DRAFT', 'SENT', 'PARTIAL');

  IF v_open_purchase_orders > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'open_purchase_orders',
      'count', v_open_purchase_orders,
      'message', format('Hay %s órdenes de compra abiertas', v_open_purchase_orders)
    ));
  END IF;
```

**Estados que bloquean (confirmados con DB real):**

| Tabla | Estados que bloquean | Estados que NO bloquean |
|-------|---------------------|------------------------|
| `transfers` | PENDIENTE, CONFIRMADA | CANCELADA |
| `production_orders` | draft, approved, in_progress, paused | closed, voided |
| `cash_sessions` | open | (cualquier otro) |
| `receipts` | pending, active | reversed, completed, cancelled |
| `inventory_reservations` | ACTIVE | CONSUMED, RELEASED |
| `purchase_orders` | DRAFT, SENT, PARTIAL | (cualquier otro de cierre) |

---

## 4. Cambios de Tablas

### 4.1 Tabla nueva: `bulk_confirmation_tokens`

```sql
CREATE TABLE IF NOT EXISTS public.bulk_confirmation_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  store_ids     UUID[] NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('delete', 'archive')),
  created_by    UUID,  -- sin FK a profiles (service role puede ser NULL)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  metadata      JSONB
);

CREATE INDEX idx_bulk_tokens_token ON public.bulk_confirmation_tokens(token)
  WHERE consumed_at IS NULL;
CREATE INDEX idx_bulk_tokens_cleanup ON public.bulk_confirmation_tokens(expires_at)
  WHERE consumed_at IS NULL;

-- RLS: solo el creador puede leer su token
ALTER TABLE public.bulk_confirmation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY bulk_tokens_owner_read ON public.bulk_confirmation_tokens
  FOR SELECT TO authenticated USING (created_by = auth.uid() OR created_by IS NULL);
```

### 4.2 Tabla nueva: `bulk_ops_log` (para rate limiting por hora)

```sql
CREATE TABLE IF NOT EXISTS public.bulk_ops_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  action        TEXT NOT NULL,
  store_count   INTEGER NOT NULL,
  initiated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'initiated',
  ip_address    TEXT,
  idempotency_key TEXT
);

CREATE INDEX idx_bulk_ops_log_user_hour ON public.bulk_ops_log(user_id, initiated_at DESC);
CREATE INDEX idx_bulk_ops_log_cleanup ON public.bulk_ops_log(initiated_at);

-- RLS: solo el usuario puede ver sus propios logs
ALTER TABLE public.bulk_ops_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY bulk_ops_log_owner ON public.bulk_ops_log
  FOR ALL TO authenticated USING (user_id = auth.uid());
```

### 4.3 Columnas nuevas en `restore_sessions` (reutilizar para bulk)

```sql
ALTER TABLE public.restore_sessions
  ADD COLUMN IF NOT EXISTS initiator_ip TEXT,
  ADD COLUMN IF NOT EXISTS initiator_session TEXT,
  ADD COLUMN IF NOT EXISTS backup_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS backup_table_count INTEGER,
  ADD COLUMN IF NOT EXISTS backup_row_count INTEGER;
```

---

## 5. Política RLS

### 5.1 `bulk_confirmation_tokens`

- **SELECT**: solo el creador (`created_by = auth.uid()`) o service role (`created_by IS NULL`)
- **INSERT**: solo via RPC `generate_bulk_confirmation_token()` (SECURITY DEFINER)
- **UPDATE**: solo via RPC `bulk_soft_delete_stores()` (consume token)
- **DELETE**: solo admin via SQL directo (cleanup de tokens expirados)

### 5.2 `bulk_ops_log`

- **SELECT**: solo el usuario (`user_id = auth.uid()`)
- **INSERT**: via API route (service role)
- **UPDATE/DELETE**: no permitido (append-only)

---

## 6. Flujo UI/Backend

### 6.1 Backend — `POST /api/stores/bulk/preview`

```typescript
// Schema
const previewSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete']),
});

// Handler
async function previewHandler(req, session) {
  // 1. Validar admin
  // 2. Validar canManageStore por storeId
  // 3. Para action='delete': llamar validate_store_can_be_modified() por tienda
  // 4. Retornar:
  //    {
  //      storeIds: [...],
  //      action: 'delete',
  //      can_proceed: boolean,
  //      blockers: [{ store_id, blockers[] }, ...],
  //      requires_confirmation: true (para delete),
  //      confirmation_text_required: 'BULK_DELETE'
  //    }
}
```

### 6.2 Backend — `POST /api/stores/bulk/execute`

```typescript
// Schema
const executeSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete']),
  confirmation_text: z.string().optional(),
  reason: z.string().optional(),
  confirmation_token: z.string().optional(),
}).refine(
  (data) => {
    // Para delete: requerir confirmation_text='BULK_DELETE', reason, confirmation_token
    if (data.action === 'delete') {
      return data.confirmation_text === 'BULK_DELETE'
        && data.reason && data.reason.length >= 10
        && data.confirmation_token;
    }
    return true;
  },
  { message: 'Delete requiere confirmation_text=BULK_DELETE, reason (min 10 chars), confirmation_token' }
);

// Handler
async function executeHandler(req, session) {
  // 1. Validar admin
  // 2. Rate limit por hora (H-08-02)
  // 3. Para delete:
  //    a. Validar confirmation_text === 'BULK_DELETE'
  //    b. Validar reason
  //    c. Insertar bulk_ops_log (auditoría previa — H-08-08)
  //    d. Llamar RPC bulk_soft_delete_stores() con confirmation_token
  // 4. Para activate/deactivate:
  //    a. UPDATE atómico con .in('id', storeIds) (H-08-07)
  // 5. Insertar audit_log de completion
  // 6. Retornar resultado
}
```

### 6.3 Frontend — `StoresManagementView` cambios

```typescript
// Estado actual:
const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
const [bulkConfirm, setBulkConfirm] = useState(false);

// Nuevo estado:
const [bulkPreview, setBulkPreview] = useState<BulkPreviewResult | null>(null);
const [bulkExecute, setBulkExecute] = useState<{
  confirmationText: string;
  reason: string;
  loading: boolean;
}>({ confirmationText: '', reason: '', loading: false });

// Flujo:
// 1. Usuario selecciona tiendas + click "Eliminar"
// 2. Llama POST /api/stores/bulk/preview
// 3. Muestra modal con:
//    - Lista de tiendas seleccionadas
//    - Blockers por tienda (si hay)
//    - Campo "Escribe BULK_DELETE para confirmar"
//    - Campo "Motivo" (textarea, min 10 chars)
//    - Botón "Generar token" → llama generate_bulk_confirmation_token()
// 4. Usuario escribe BULK_DELETE + motivo + click "Confirmar eliminación"
// 5. Llama POST /api/stores/bulk/execute con confirmation_token
// 6. Muestra resultado (success/partial/failed)
```

---

## 7. Rate Limiting por Hora (H-08-02)

### 7.1 Implementación

```typescript
// src/lib/rate-limit/tenant-limiter.ts (ampliar)

export async function checkBulkOpsHourlyLimit(
  userId: string,
  plan: Plan
): Promise<QuotaResult> {
  const limit = PLAN_LIMITS[plan].bulkOpsPerHour;
  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, limit };
  }

  // Contar bulk ops en la última hora
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdminSafe()
    .from('bulk_ops_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('initiated_at', oneHourAgo);

  if (error) {
    // Fail-open: si no podemos verificar, permitir (logged)
    logger.error('RATE_LIMIT', 'BULK_OPS_HOURLY_CHECK_FAILED', { error });
    return { allowed: true, remaining: limit, limit };
  }

  const used = count || 0;
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;

  return {
    allowed,
    remaining,
    limit,
    resetAt: Date.now() + 60 * 60 * 1000,
    reason: allowed ? undefined : `Hourly limit exceeded (${used}/${limit})`,
  };
}
```

### 7.2 Uso en el handler

```typescript
// En POST /api/stores/bulk/execute
const hourlyRl = await checkBulkOpsHourlyLimit(session.user.id, plan);
if (!hourlyRl.allowed) {
  return NextResponse.json(
    createApiError('BULK_OP_HOURLY_LIMIT'),
    { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
  );
}

// Insertar log antes del execute
await getSupabaseAdminSafe()
  .from('bulk_ops_log')
  .insert({
    user_id: session.user.id,
    action: validated.data.action,
    store_count: allowedIds.length,
    initiated_at: new Date().toISOString(),
    status: 'initiated',
    ip_address: clientIp,
    idempotency_key: idemKeyRaw,
  });
```

---

## 8. Estrategia Rollback

### 8.1 Rollback transaccional (H-08-04)

El RPC `bulk_soft_delete_stores()` es **atómico**:
- Fase VALIDATE: si alguna tienda tiene blockers, retorna `status=FAILED` sin modificar nada
- Fase EXECUTE: si alguna tienda falla durante el soft-delete, `RAISE EXCEPTION` → PostgreSQL hace ROLLBACK de toda la transacción
- El token se consume solo si el execute llega al COMMIT

### 8.2 Rollback operacional (si se necesita deshacer)

Si un admin borra tiendas por error:
1. **soft_delete_store** no elimina datos — solo marca `is_active=false`
2. Para restaurar: `UPDATE stores SET is_active=true WHERE id IN (...)`
3. Restaurar memberships: `UPDATE user_store_memberships SET status='active' WHERE store_id IN (...)`
4. El `audit_logs` registra quién borró y cuándo

### 8.3 Rollback de migration

Si la migration causa problemas:
1. Las tablas nuevas (`bulk_confirmation_tokens`, `bulk_ops_log`) se pueden DROP sin afectar datos existentes
2. `validate_store_can_be_modified()` se puede revertir a la versión anterior
3. El endpoint `/api/stores/bulk` original sigue funcionando (deprecado pero no eliminado)

---

## 9. Plan de Pruebas PT-8.x

### PT-8.1: Rate limit por hora (H-08-02)

| Step | Acción | Esperado |
|------|--------|----------|
| 1 | Usuario free hace 1 bulk op | ✅ Permitido |
| 2 | Usuario free hace 2da bulk op en <1h | ❌ 429 BULK_OP_HOURLY_LIMIT |
| 3 | Usuario pro hace 20 bulk ops | ✅ Permitido |
| 4 | Usuario pro hace 21ra bulk op en <1h | ❌ 429 |
| 5 | Usuario enterprise hace 100 bulk ops | ✅ Permitido (unlimited) |

### PT-8.2: Validación de dependencias (H-08-03)

| Step | Setup | Acción | Esperado |
|------|-------|--------|----------|
| 1 | Tienda con transfer PENDIENTE | bulk delete | ❌ FAILED, blockers=[transfers] |
| 2 | Tienda con cash_session OPEN | bulk delete | ❌ FAILED, blockers=[cash_sessions] |
| 3 | Tienda con inventory_reservation ACTIVE | bulk delete | ❌ FAILED, blockers=[reservations] |
| 4 | Tienda con purchase_order DRAFT | bulk delete | ❌ FAILED, blockers=[purchase_orders] |
| 5 | Tienda con todo cerrado | bulk delete | ✅ COMPLETED |
| 6 | 2 tiendas: una con blocker, una sin | bulk delete | ❌ FAILED, processed=0, errors=[{store1, blockers}] |

### PT-8.3: Atomicidad de bulk delete (H-08-04)

| Step | Setup | Acción | Esperado |
|------|-------|--------|----------|
| 1 | 5 tiendas válidas | bulk delete | ✅ COMPLETED, processed=5 |
| 2 | 5 tiendas, 3 con blockers | bulk delete | ❌ FAILED, processed=0 (ninguna se borra) |
| 3 | 50 tiendas válidas | bulk delete | ✅ COMPLETED, processed=50 |
| 4 | bulk delete exitoso + verificar | SELECT is_active FROM stores | Todas is_active=false |

### PT-8.4: Auditoría previa (H-08-08)

| Step | Acción | Esperado |
|------|--------|----------|
| 1 | bulk delete execute | audit_log con action='bulk_store_deleted' insertado |
| 2 | Verificar metadata | Contiene store_ids, deleted_by, reason, processed, deleted_at |
| 3 | Verificar bulk_ops_log | Registro con status='initiated' antes del execute |

### PT-8.5: Confirmación server-side (H-08-10)

| Step | Acción | Esperado |
|------|--------|----------|
| 1 | bulk delete sin confirmation_text | ❌ 400 Validation error |
| 2 | bulk delete con confirmation_text='BULK' | ❌ 400 (debe ser 'BULK_DELETE') |
| 3 | bulk delete con confirmation_text='BULK_DELETE' pero sin reason | ❌ 400 |
| 4 | bulk delete con confirmation_text='BULK_DELETE' + reason + token válido | ✅ 200 |
| 5 | Reutilizar mismo confirmation_token | ❌ ERR_INVALID_CONFIRMATION_TOKEN |
| 6 | Usar token expirado (>10 min) | ❌ ERR_INVALID_CONFIRMATION_TOKEN |

### PT-8.6: Activate/deactivate atómico (H-08-07)

| Step | Acción | Esperado |
|------|--------|----------|
| 1 | bulk activate 5 tiendas con UPDATE .in() | ✅ 5 actualizadas en 1 query |
| 2 | bulk deactivate 3 tiendas | ✅ 3 actualizadas |
| 3 | Verificar atomicidad | Todas se actualizan o ninguna |

### PT-8.7: Token generation y consumo

| Step | Acción | Esperado |
|------|--------|----------|
| 1 | generate_bulk_confirmation_token para delete | ✅ Token generado |
| 2 | generate para action='activate' | ❌ ERR_NON_DESTRUCTIVE_ACTION |
| 3 | Token expira en 10 min | ✅ expires_at = NOW() + 10 min |
| 4 | Token se consume después de execute | ✅ consumed_at = NOW() |

---

## 10. Migrations Propuestas (NO aplicar todavía)

### Migration 1: `20260802000009_v2_12_48_bulk_delete_safety.sql`

```sql
-- 1. Tabla bulk_confirmation_tokens
CREATE TABLE IF NOT EXISTS public.bulk_confirmation_tokens (...);
-- 2. Tabla bulk_ops_log
CREATE TABLE IF NOT EXISTS public.bulk_ops_log (...);
-- 3. RPC generate_bulk_confirmation_token()
-- 4. RPC bulk_soft_delete_stores()
-- 5. Ampliar validate_store_can_be_modified() con 2 checks nuevos
-- 6. RLS policies
```

### Migration 2: Cambios en código TypeScript (no SQL)

```typescript
// src/lib/rate-limit/tenant-limiter.ts: agregar checkBulkOpsHourlyLimit()
// src/app/api/stores/bulk/preview/route.ts: NUEVO
// src/app/api/stores/bulk/execute/route.ts: NUEVO
// src/app/api/stores/bulk/route.ts: deprecar (mantener por compatibilidad)
// src/components/views/terminal/views/stores/StoresManagementView.tsx: UI mejorada
// src/hooks/api/useStores.ts: useBulkStoreAction ampliado
```

---

## 11. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `bulk_soft_delete_stores` lento para 50 tiendas | Media | Bajo | Validación previa es rápida (queries COUNT); soft_delete_store ya es atómico |
| Token expira mientras usuario escribe confirmación | Baja | Bajo | Expiración 10 min es suficiente; si expira, usuario debe re-generar |
| `bulk_ops_log` crece indefinidamente | Media | Bajo | Cleanup job semanal: `DELETE FROM bulk_ops_log WHERE initiated_at < NOW() - INTERVAL '30 days'` |
| Rate limit por hora falla (DB no responde) | Baja | Medio | Fail-open: si no se puede verificar, permitir (logged) |
| Deprecar `/api/stores/bulk` rompe clientes existentes | Baja | Medio | Mantener endpoint antiguo funcional (sin confirmación) pero log warning |

---

## 12. Estado

```
Diseño:                ✅ Completo
Aprobación usuario:    ⏳ Pendiente
Migration SQL:         ⏳ No aplicada
Código TypeScript:     ⏳ No implementado
Pruebas PT-8.x:        ⏳ No ejecutadas
```

**Espero tu aprobación antes de aplicar cualquier migration o modificar código.**
