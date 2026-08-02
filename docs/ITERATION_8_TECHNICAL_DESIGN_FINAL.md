# Iteración 8 — Diseño Técnico Final (Pre-Implementación)

**Fecha:** 2026-08-02
**Iteración:** 8 — Bulk Store Operations
**Fase:** Diseño técnico final (pendiente aprobación antes de aplicar migrations)
**Scope:** Fase 1 — 5 hallazgos críticos + protección adicional (backup_restore_protected)

---

## 0. Ajustes Incorporados (de tu aprobación)

| # | Ajuste solicitado | Incorporado |
|---|-------------------|-------------|
| 1 | Rate limit parametrizable por plan + logging completo | ✅ `bulk_ops_log` con usuario, tenant, store_count, timestamps, resultado |
| 2 | `validate_store_can_be_modified` debe devolver qué dependencia bloquea | ✅ Retorna `blockers[]` con `{store_id, type, count}` |
| 3 | Atomicidad all-or-nothing, no modo parcial | ✅ `bulk_soft_delete_stores` retorna `processed=0` si alguna falla |
| 4 | Confirmación fuerte solo para delete; archive/deactivate usan confirmación normal | ✅ `BULK_DELETE` + token solo para `action='delete'` |
| 5 | Protección adicional: `stores.backup_restore_protected` + doble confirmación | ✅ Columna nueva + `tenant_admin` check + segundo token |
| 6 | Entregar primero: Migration SQL + cambios TS + diagrama + lista archivos | ✅ Este documento |

### Nota sobre `tenant_admin`

El sistema actual **no tiene** rol `tenant_admin` — los roles existentes son: `admin`, `encargado`, `clerk`, `warehouse`, `costo`. El rol `admin` es el más alto.

**Decisión de diseño:** Para tiendas `backup_restore_protected=true`, requerir:
1. Rol `admin` (siempre)
2. **Doble token**: el primer token (`preview_token`) genera el `confirmation_token` de execute. Para tiendas protegidas, se requiere un **segundo token** (`override_token`) que solo puede generar otro admin (flujo de doble aprobación).

Esto implementa el concepto de "doble confirmación" sin introducir un rol nuevo que rompería el esquema existente.

---

## 1. Migration SQL Propuesta

**Archivo:** `supabase/migrations/20260802000009_v2_12_48_bulk_delete_safety.sql`

```sql
-- =============================================================================
-- Migration: 20260802000009_v2_12_48_bulk_delete_safety.sql
-- Iteración 8 — Bulk Store Operations Remediation (Fase 1)
--
-- Componentes:
--   1. stores.backup_restore_protected (columna nueva)
--   2. bulk_confirmation_tokens (tabla nueva)
--   3. bulk_ops_log (tabla nueva para rate limit por hora)
--   4. generate_bulk_confirmation_token() RPC
--   5. generate_bulk_override_token() RPC (para tiendas protegidas)
--   6. bulk_soft_delete_stores() RPC (atómico)
--   7. Ampliación validate_store_can_be_modified() (+2 checks)
--   8. check_bulk_ops_hourly_limit() RPC
--   9. RLS policies
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. stores.backup_restore_protected
-- =============================================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS backup_restore_protected BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.backup_restore_protected IS
  'Si TRUE, la tienda requiere doble confirmación (override_token de otro admin) para operaciones destructivas bulk. Default TRUE para proteger tiendas productivas.';

-- Marcar tiendas de testing como no protegidas
UPDATE public.stores
SET backup_restore_protected = false
WHERE name LIKE 'TEST-%'
   OR name LIKE 'E2E %'
   OR name LIKE 'BACKUP_RESTORE_TEST%';

-- =============================================================================
-- 2. bulk_confirmation_tokens
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bulk_confirmation_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  store_ids     UUID[] NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('delete', 'archive')),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  metadata      JSONB,
  -- Para override tokens (doble confirmación en tiendas protegidas)
  is_override   BOOLEAN NOT NULL DEFAULT false,
  override_for  TEXT  -- token al que hace override (el confirmation_token original)
);

CREATE INDEX IF NOT EXISTS idx_bulk_tokens_token
  ON public.bulk_confirmation_tokens(token)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_tokens_cleanup
  ON public.bulk_confirmation_tokens(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.bulk_confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulk_tokens_owner_read ON public.bulk_confirmation_tokens
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

-- =============================================================================
-- 3. bulk_ops_log (rate limit por hora + auditoría)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bulk_ops_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  tenant_id       UUID,
  action          TEXT NOT NULL,
  store_count     INTEGER NOT NULL,
  store_ids       UUID[] NOT NULL,
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'initiated'
                  CHECK (status IN ('initiated', 'completed', 'failed', 'partial')),
  ip_address      TEXT,
  idempotency_key TEXT,
  result          JSONB,
  reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_log_user_hour
  ON public.bulk_ops_log(user_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_log_cleanup
  ON public.bulk_ops_log(initiated_at);

ALTER TABLE public.bulk_ops_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulk_ops_log_owner ON public.bulk_ops_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 4. generate_bulk_confirmation_token()
-- =============================================================================
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
  v_has_protected BOOLEAN;
BEGIN
  IF p_action NOT IN ('delete', 'archive') THEN
    RAISE EXCEPTION 'ERR_NON_DESTRUCTIVE_ACTION: Token solo para delete/archive';
  END IF;

  -- Verificar si hay tiendas protegidas
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  v_token := 'bct_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at, metadata
  ) VALUES (
    v_token, p_store_ids, p_action, p_user_id,
    NOW() + INTERVAL '10 minutes',
    jsonb_build_object('has_protected_stores', v_has_protected)
  );

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.generate_bulk_confirmation_token IS
  'Genera token de confirmación para bulk delete/archive. Expira en 10 min. Si hay tiendas protegidas, metadata.has_protected_stores=true.';

-- =============================================================================
-- 5. generate_bulk_override_token()
-- =============================================================================
-- Segundo token requerido para tiendas backup_restore_protected=true
-- Solo puede ser generado por OTRO admin (no el mismo que generó el confirmation_token)

CREATE OR REPLACE FUNCTION public.generate_bulk_override_token(
  p_confirmation_token TEXT,
  p_override_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_override_token TEXT;
  v_override_user_role TEXT;
BEGIN
  -- 1. Validar que el confirmation_token existe y no ha sido consumido
  SELECT * INTO v_original
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND consumed_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_OR_EXPIRED_TOKEN: confirmation_token inválido';
  END IF;

  -- 2. Validar que el override_user es admin
  SELECT role INTO v_override_user_role
  FROM public.profiles
  WHERE id = p_override_user_id;

  IF v_override_user_role IS NULL OR v_override_user_role != 'admin' THEN
    RAISE EXCEPTION 'ERR_OVERRIDE_REQUIRES_ADMIN: El override debe ser de otro admin';
  END IF;

  -- 3. Validar que el override_user NO es el mismo que generó el confirmation_token
  IF v_original.created_by = p_override_user_id THEN
    RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE: El override debe ser de un admin DIFERENTE al que inició la operación';
  END IF;

  -- 4. Generar override_token
  v_override_token := 'bot_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at,
    is_override, override_for
  ) VALUES (
    v_override_token, v_original.store_ids, v_original.action, p_override_user_id,
    NOW() + INTERVAL '10 minutes',
    true, p_confirmation_token
  );

  RETURN v_override_token;
END;
$$;

COMMENT ON FUNCTION public.generate_bulk_override_token IS
  'Genera override_token para tiendas protegidas. Debe ser generado por OTRO admin (no el mismo que el confirmation_token). Implementa doble confirmación.';

-- =============================================================================
-- 6. bulk_soft_delete_stores() — Atómico
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_stores(
  p_store_ids UUID[],
  p_deleted_by UUID,
  p_confirmation_token TEXT,
  p_override_token TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
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
  v_token_valid BOOLEAN;
  v_has_protected BOOLEAN;
  v_override_valid BOOLEAN;
BEGIN
  -- ============================================================
  -- 1. VALIDATE confirmation_token
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.bulk_confirmation_tokens
    WHERE token = p_confirmation_token
      AND action = 'delete'
      AND expires_at > NOW()
      AND consumed_at IS NULL
      AND NOT is_override
  ) INTO v_token_valid;

  IF NOT v_token_valid THEN
    RAISE EXCEPTION 'ERR_INVALID_CONFIRMATION_TOKEN';
  END IF;

  -- ============================================================
  -- 2. VALIDATE tiendas protegidas requieren override_token
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  IF v_has_protected THEN
    IF p_override_token IS NULL THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_REQUIRED: Tiendas protegidas requieren override_token de otro admin';
    END IF;

    -- Validar override_token
    SELECT EXISTS(
      SELECT 1 FROM public.bulk_confirmation_tokens
      WHERE token = p_override_token
        AND is_override = true
        AND override_for = p_confirmation_token
        AND expires_at > NOW()
        AND consumed_at IS NULL
    ) INTO v_override_valid;

    IF NOT v_override_valid THEN
      RAISE EXCEPTION 'ERR_INVALID_OVERRIDE_TOKEN';
    END IF;

    -- Consumir override_token
    UPDATE public.bulk_confirmation_tokens
    SET consumed_at = NOW()
    WHERE token = p_override_token;
  END IF;

  -- Consumir confirmation_token (prevent reuse)
  UPDATE public.bulk_confirmation_tokens
  SET consumed_at = NOW()
  WHERE token = p_confirmation_token;

  -- ============================================================
  -- 3. VALIDATE: todas las tiendas pasan validaciones antes de modificar
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

    -- Validar dependencias
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
      'errors', to_jsonb(v_errors),
      'reason', p_reason
    );
  END IF;

  -- ============================================================
  -- 4. EXECUTE: todas las validaciones pasaron
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    PERFORM public.soft_delete_store(v_store_id, p_deleted_by);
    v_processed := v_processed + 1;
  END LOOP;

  -- ============================================================
  -- 5. AUDIT
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
      'had_protected_stores', v_has_protected,
      'deleted_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'COMPLETED',
    'processed', v_processed,
    'total_requested', array_length(p_store_ids, 1),
    'errors', '[]'::jsonb,
    'reason', p_reason
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_soft_delete_stores IS
  'Bulk soft-delete atómico. Fase VALIDATE antes de EXECUTE. Si alguna tienda falla, ROLLBACK (processed=0). Tiendas protegidas requieren override_token de otro admin.';

-- =============================================================================
-- 7. Ampliación validate_store_can_be_modified()
-- =============================================================================
-- Agregar 2 checks nuevos al final (antes del RETURN)

CREATE OR REPLACE FUNCTION public.validate_store_can_be_modified(
  p_store_id UUID,
  p_check_type TEXT DEFAULT 'soft_delete'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blockers JSONB[] := '{}'::jsonb[];
  v_pending_transfers_out INTEGER := 0;
  v_pending_transfers_in INTEGER := 0;
  v_open_ots INTEGER := 0;
  v_open_cash_sessions INTEGER := 0;
  v_pending_receipts INTEGER := 0;
  v_active_reservations INTEGER := 0;  -- NUEVO
  v_open_purchase_orders INTEGER := 0;  -- NUEVO
BEGIN
  -- Transferencias pendientes (origin)
  SELECT COUNT(*) INTO v_pending_transfers_out
  FROM transfers
  WHERE origin_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');
  IF v_pending_transfers_out > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'OPEN_TRANSFERS_OUT',
      'count', v_pending_transfers_out,
      'message', format('Hay %s transferencias salientes pendientes', v_pending_transfers_out)
    ));
  END IF;

  -- Transferencias pendientes (destination)
  SELECT COUNT(*) INTO v_pending_transfers_in
  FROM transfers
  WHERE destination_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');
  IF v_pending_transfers_in > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'OPEN_TRANSFERS_IN',
      'count', v_pending_transfers_in,
      'message', format('Hay %s transferencias entrantes pendientes', v_pending_transfers_in)
    ));
  END IF;

  -- Órdenes de producción abiertas
  SELECT COUNT(*) INTO v_open_ots
  FROM production_orders
  WHERE store_id = p_store_id
    AND status IN ('draft', 'approved', 'in_progress', 'paused');
  IF v_open_ots > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'OPEN_PRODUCTION_ORDERS',
      'count', v_open_ots,
      'message', format('Hay %s órdenes de producción abiertas', v_open_ots)
    ));
  END IF;

  -- Sesiones de caja abiertas
  SELECT COUNT(*) INTO v_open_cash_sessions
  FROM cash_sessions
  WHERE store_id = p_store_id
    AND status = 'open';
  IF v_open_cash_sessions > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'OPEN_CASH_SESSION',
      'count', v_open_cash_sessions,
      'message', format('Hay %s sesiones de caja abiertas', v_open_cash_sessions)
    ));
  END IF;

  -- Recepciones pendientes
  SELECT COUNT(*) INTO v_pending_receipts
  FROM receipts
  WHERE store_id = p_store_id
    AND status IN ('pending', 'active');
  IF v_pending_receipts > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'PENDING_RECEIPTS',
      'count', v_pending_receipts,
      'message', format('Hay %s recepciones pendientes', v_pending_receipts)
    ));
  END IF;

  -- NUEVO: Reservas de inventario activas
  SELECT COUNT(*) INTO v_active_reservations
  FROM inventory_reservations
  WHERE store_id = p_store_id
    AND status = 'ACTIVE';
  IF v_active_reservations > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id,
      'type', 'ACTIVE_INVENTORY_RESERVATIONS',
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
      'store_id', p_store_id,
      'type', 'OPEN_PURCHASE_ORDERS',
      'count', v_open_purchase_orders,
      'message', format('Hay %s órdenes de compra abiertas', v_open_purchase_orders)
    ));
  END IF;

  RETURN jsonb_build_object(
    'can_delete', array_length(v_blockers, 1) IS NULL,
    'can_modify', array_length(v_blockers, 1) IS NULL,
    'blockers', COALESCE(array_to_json(v_blockers)::jsonb, '[]'::jsonb)
  );
END;
$$;

-- =============================================================================
-- 8. check_bulk_ops_hourly_limit()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_bulk_ops_hourly_limit(
  p_user_id UUID,
  p_plan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  -- Plan limits (same as PLAN_LIMITS in TypeScript)
  v_limit := CASE p_plan
    WHEN 'free' THEN 1
    WHEN 'pro' THEN 20
    WHEN 'enterprise' THEN 999999  -- effectively unlimited
    ELSE 1  -- default to free
  END;

  -- Contar bulk ops en la última hora
  SELECT COUNT(*) INTO v_used
  FROM public.bulk_ops_log
  WHERE user_id = p_user_id
    AND initiated_at > NOW() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$$;

-- =============================================================================
-- 9. Grants
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.generate_bulk_confirmation_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_bulk_override_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_stores TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_store_can_be_modified TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_bulk_ops_hourly_limit TO authenticated;

-- =============================================================================
-- 10. Verificación post-migration
-- =============================================================================
DO $$
DECLARE
  v_func_count INTEGER;
  v_col_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'generate_bulk_confirmation_token',
      'generate_bulk_override_token',
      'bulk_soft_delete_stores',
      'check_bulk_ops_hourly_limit'
    );

  RAISE NOTICE 'Funciones nuevas creadas: % (esperadas: 4)', v_func_count;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'backup_restore_protected'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'stores.backup_restore_protected no fue creada';
  END IF;

  RAISE NOTICE 'stores.backup_restore_protected OK ✓';
  RAISE NOTICE 'Migration BR-2.3 verificada ✓';
END $$;

COMMIT;
```

---

## 2. Cambios TypeScript Previstos

### 2.1 Archivos nuevos

| Archivo | Líneas est. | Propósito |
|---------|------------:|-----------|
| `src/app/api/stores/bulk/preview/route.ts` | ~120 | Preview con validación de dependencias |
| `src/app/api/stores/bulk/execute/route.ts` | ~180 | Execute con confirmación + token + rate limit |
| `src/app/api/stores/bulk/generate-token/route.ts` | ~80 | Generar confirmation_token |
| `src/app/api/stores/bulk/generate-override/route.ts` | ~90 | Generar override_token (doble confirmación) |

### 2.2 Archivos modificados

| Archivo | Cambio | Líneas afectadas |
|---------|--------|-----------------:|
| `src/lib/rate-limit/tenant-limiter.ts` | +`checkBulkOpsHourlyLimit()` usando `bulk_ops_log` | +40 |
| `src/app/api/stores/bulk/route.ts` | Deprecar (log warning, redirigir a /execute) | +15 |
| `src/hooks/api/useStores.ts` | +`useBulkPreview`, `useBulkExecute`, `useGenerateBulkToken`, `useGenerateBulkOverride` | +80 |
| `src/services/store-api-client.ts` | +`bulkPreview`, `bulkExecute`, `generateBulkToken`, `generateBulkOverride` | +60 |
| `src/components/views/terminal/views/stores/StoresManagementView.tsx` | UI confirmación mejorada (BULK_DELETE + motivo + token + override) | +120 |
| `src/types/index.ts` | +`BulkPreviewResult`, `BulkExecuteResult`, `BulkTokenResponse` | +30 |

### 2.3 Detalle de cambios clave

#### `POST /api/stores/bulk/preview/route.ts` (nuevo)

```typescript
const previewSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete', 'archive']),
});

async function previewHandler(req, session) {
  // 1. Validar admin
  // 2. Filtrar canManageStore
  // 3. Para action='delete': llamar validate_store_can_be_modified() por tienda
  // 4. Verificar backup_restore_protected por tienda
  // 5. Retornar:
  //    {
  //      storeIds, action,
  //      can_proceed: boolean,
  //      blockers: [{ store_id, type, count, message }, ...],
  //      protected_stores: string[],  // storeIds con backup_restore_protected=true
  //      requires_confirmation: action === 'delete',
  //      confirmation_text_required: action === 'delete' ? 'BULK_DELETE' : null,
  //      requires_override: protected_stores.length > 0
  //    }
}
```

#### `POST /api/stores/bulk/execute/route.ts` (nuevo)

```typescript
const executeSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete', 'archive']),
  confirmation_text: z.string().optional(),
  reason: z.string().optional(),
  confirmation_token: z.string().optional(),
  override_token: z.string().optional(),
}).refine((data) => {
  if (data.action === 'delete') {
    return data.confirmation_text === 'BULK_DELETE'
      && data.reason && data.reason.length >= 10
      && data.confirmation_token;
  }
  return true;
}, { message: 'Delete requiere BULK_DELETE + reason + token' });

async function executeHandler(req, session) {
  // 1. Validar admin
  // 2. Rate limit por hora (check_bulk_ops_hourly_limit)
  // 3. Insertar bulk_ops_log (auditoría previa)
  // 4. Para delete:
  //    a. Validar confirmation_text === 'BULK_DELETE'
  //    b. Validar reason
  //    c. Si hay tiendas protegidas: validar override_token
  //    d. Llamar RPC bulk_soft_delete_stores()
  // 5. Para activate/deactivate:
  //    a. UPDATE atómico con .in('id', storeIds)
  // 6. Update bulk_ops_log con resultado
  // 7. Retornar resultado
}
```

#### `StoresManagementView.tsx` — UI de confirmación

```tsx
// Estado nuevo
const [bulkPreview, setBulkPreview] = useState<BulkPreviewResult | null>(null);
const [bulkExecute, setBulkExecute] = useState({
  confirmationText: '',
  reason: '',
  confirmationToken: '',
  overrideToken: '',
  loading: false,
  step: 'preview' as 'preview' | 'confirm' | 'override' | 'executing',
});

// Flujo UI:
// 1. Usuario selecciona tiendas + click "Eliminar"
// 2. Llama POST /api/stores/bulk/preview
// 3. Si can_proceed=false: muestra blockers, no permite continuar
// 4. Si can_proceed=true:
//    a. Si hay tiendas protegidas: muestra mensaje "Requiere doble confirmación"
//    b. Pide confirmation_text='BULK_DELETE' + reason
//    c. Llama POST /api/stores/bulk/generate-token → confirmation_token
//    d. Si requires_override:
//       - Muestra "Otro admin debe aprobar esta operación"
//       - Pide override_token (input manual del segundo admin)
//       - Llama POST /api/stores/bulk/generate-override (con credenciales del 2do admin)
//    e. Llama POST /api/stores/bulk/execute con tokens
// 5. Muestra resultado
```

---

## 3. Diagrama del Flujo Final

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BULK DELETE FLOW (FINAL)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Admin A selecciona N tiendas                                       │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────┐                       │
│  │ POST /api/stores/bulk/preview             │                       │
│  │ Body: { storeIds, action: 'delete' }     │                       │
│  │                                            │                       │
│  │ 1. Validar admin A                        │                       │
│  │ 2. canManageStore por storeId             │                       │
│  │ 3. validate_store_can_be_modified()       │                       │
│  │    por tienda → blockers[]                │                       │
│  │ 4. Verificar backup_restore_protected     │                       │
│  │    por tienda → protected_stores[]        │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                                │
│         ┌───────────┴───────────┐                                   │
│         ▼                       ▼                                   │
│  can_proceed=false        can_proceed=true                          │
│  Mostrar blockers         ¿Hay tiendas protegidas?                  │
│  No permitir continuar         │                                    │
│                       ┌─────────┴─────────┐                         │
│                       ▼                   ▼                         │
│                   NO (sin override)   SÍ (con override)             │
│                       │                   │                         │
│                       │                   ▼                         │
│                       │     Admin A pide a Admin B que genere       │
│                       │     override_token (doble confirmación)     │
│                       │                   │                         │
│                       │                   ▼                         │
│                       │     POST /api/stores/bulk/generate-override│
│                       │     (Admin B se autentica con su JWT)       │
│                       │     → override_token (bot_xxx)              │
│                       │                   │                         │
│                       └───────────┬───────┘                         │
│                                   ▼                                  │
│  Admin A escribe:                                                  │
│    - confirmation_text = 'BULK_DELETE'                             │
│    - reason (min 10 chars)                                         │
│    - genera confirmation_token (bct_xxx)                           │
│                                   │                                  │
│                                   ▼                                  │
│  ┌──────────────────────────────────────────┐                       │
│  │ POST /api/stores/bulk/execute             │                       │
│  │ Body: {                                   │                       │
│  │   storeIds, action: 'delete',             │                       │
│  │   confirmation_text: 'BULK_DELETE',       │                       │
│  │   reason: 'motivo...',                    │                       │
│  │   confirmation_token: 'bct_xxx',          │                       │
│  │   override_token: 'bot_xxx' (si protected)│                       │
│  │ }                                         │                       │
│  │                                            │                       │
│  │ 1. Validar admin A                        │                       │
│  │ 2. check_bulk_ops_hourly_limit()          │                       │
│  │ 3. Insertar bulk_ops_log (initiated)      │                       │
│  │ 4. Llamar RPC bulk_soft_delete_stores()   │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                                │
│                     ▼                                                │
│  ┌──────────────────────────────────────────┐                       │
│  │ RPC bulk_soft_delete_stores()             │                       │
│  │                                            │                       │
│  │ 1. VALIDATE confirmation_token            │                       │
│  │ 2. VALIDATE override_token (si protected) │                       │
│  │ 3. VALIDATE todas las tiendas:            │                       │
│  │    - existen y activas                    │                       │
│  │    - validate_store_can_be_modified()     │                       │
│  │ 4. Si alguna falla → RETURN FAILED        │                       │
│  │    processed=0, errors[]                  │                       │
│  │ 5. EXECUTE soft_delete_store() en loop    │                       │
│  │ 6. AUDIT audit_logs                       │                       │
│  │ 7. RETURN COMPLETED                       │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                                │
│                     ▼                                                │
│  Update bulk_ops_log (completed/failed)                            │
│  Retornar resultado a Admin A                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Lista Exacta de Archivos Modificados

### Archivos nuevos (4)

| # | Archivo | Tipo | Líneas est. |
|---|---------|------|------------:|
| 1 | `supabase/migrations/20260802000009_v2_12_48_bulk_delete_safety.sql` | SQL | ~350 |
| 2 | `src/app/api/stores/bulk/preview/route.ts` | API route | ~120 |
| 3 | `src/app/api/stores/bulk/execute/route.ts` | API route | ~180 |
| 4 | `src/app/api/stores/bulk/generate-token/route.ts` | API route | ~80 |
| 5 | `src/app/api/stores/bulk/generate-override/route.ts` | API route | ~90 |

### Archivos modificados (6)

| # | Archivo | Cambio | Líneas +/- |
|---|---------|--------|-----------:|
| 1 | `src/lib/rate-limit/tenant-limiter.ts` | +`checkBulkOpsHourlyLimit()` que usa `bulk_ops_log` | +40 |
| 2 | `src/app/api/stores/bulk/route.ts` | Deprecar: log warning + redirigir a /execute | +15, -0 |
| 3 | `src/hooks/api/useStores.ts` | +4 hooks: `useBulkPreview`, `useBulkExecute`, `useGenerateBulkToken`, `useGenerateBulkOverride` | +80 |
| 4 | `src/services/store-api-client.ts` | +4 métodos: `bulkPreview`, `bulkExecute`, `generateBulkToken`, `generateBulkOverride` | +60 |
| 5 | `src/components/views/terminal/views/stores/StoresManagementView.tsx` | UI confirmación: BULK_DELETE + motivo + token + override step | +120 |
| 6 | `src/types/index.ts` | +tipos: `BulkPreviewResult`, `BulkExecuteResult`, `BulkTokenResponse`, `BulkBlocker` | +30 |

### Archivos NO modificados

- `soft_delete_store()` RPC — se reutiliza sin cambios
- `validate_store_can_be_modified()` — se reemplaza con versión ampliada (en la migration)
- `POST /api/stores/[id]/archive` — sin cambios (single-store)
- `POST /api/stores/[id]/restore` — sin cambios (single-store)
- `bulk_assign_memberships()` — sin cambios (Fase 2)

### Total impacto

| Métrica | Valor |
|---------|-------|
| Archivos nuevos | 5 |
| Archivos modificados | 6 |
| Líneas nuevas (est.) | ~970 |
| Migration SQL | 1 (350 líneas) |
| RPCs nuevas | 4 |
| Tablas nuevas | 2 |
| Columnas nuevas | 1 (`stores.backup_restore_protected`) |

---

## 5. Verificación de Ajustes Solicitados

| Ajuste | Implementado en | Verificación |
|--------|-----------------|--------------|
| Rate limit parametrizable por plan | `check_bulk_ops_hourly_limit()` | free=1, pro=20, enterprise=999999 |
| Logging completo (usuario, tenant, count, timestamps, resultado) | `bulk_ops_log` tabla | 9 columnas including tenant_id, store_count, initiated_at, completed_at, status, result |
| `validate_store_can_be_modified` devuelve qué dependencia bloquea | Función ampliada | Retorna `blockers[]` con `{store_id, type, count, message}` |
| Atomicidad all-or-nothing | `bulk_soft_delete_stores()` | Fase VALIDATE antes de EXECUTE; si error → `processed=0` |
| Confirmación fuerte solo para delete | `executeSchema` refine | `action==='delete'` requiere `BULK_DELETE`; activate/deactivate/archive no |
| `stores.backup_restore_protected` | Columna nueva | `DEFAULT true`, tiendas TEST marcadas `false` |
| Doble confirmación para protegidas | `generate_bulk_override_token()` + validación en `bulk_soft_delete_stores()` | Override token debe ser de OTRO admin (validación `created_by != p_override_user_id`) |

---

## 6. Estado

```
Diseño técnico:           ✅ Completo
Migration SQL:            ✅ Propuesta (no aplicada)
Cambios TypeScript:       ✅ Listados (no implementados)
Diagrama flujo:           ✅ Completo
Lista archivos:           ✅ Completa (5 nuevos + 6 modificados)
Aprobación usuario:       ⏳ Pendiente
```

**Espero tu aprobación final antes de aplicar la migration SQL y modificar código TypeScript.**
