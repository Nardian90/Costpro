# Iteración 8 — Bulk Store Operations Audit

**Fecha:** 2026-08-02
**Iteración:** 8 — Bulk Store Operations
**Fase:** Auditoría del diseño actual (sin modificar código)
**Estado:** En progreso

---

## 1. Resumen Ejecutivo

CostPro implementa Bulk Store Operations a través de 3 capas:

1. **API routes** — `POST /api/stores/bulk` (activate/deactivate/delete), `POST /api/users/[id]/memberships/bulk`, `POST /api/stores/[id]/archive`, `POST /api/stores/[id]/restore`
2. **Supabase RPCs** — `soft_delete_store`, `bulk_assign_memberships`, `get_batch_store_daily_kpis`
3. **UI** — `StoresManagementView` con checkbox multi-select, sticky bulk action bar, `DestructiveConfirmModal` (type "BULK" to confirm)

**No existe un RPC monolítico `bulk_delete_stores`** — el handler HTTP orquesta llamadas per-store a `soft_delete_store` vía `Promise.allSettled`, retornando `{ affected, failed, denied }`.

---

## 2. Inventario de Componentes

### 2.1 Backend (API Routes)

| Endpoint | Líneas | Acciones | Auth |
|----------|-------:|----------|------|
| `POST /api/stores/bulk` | 224 | activate, deactivate, delete | admin only |
| `POST /api/stores/[id]/archive` | 133 | archive (single) | canManageStore |
| `POST /api/stores/[id]/restore` | 107 | restore (single) | canManageStore |
| `POST /api/users/[id]/memberships/bulk` | 114 | bulk assign memberships | admin/manager |
| `GET /api/stores/health-batch` | 133 | batched read (health) | canManageStore |
| `GET/POST/PATCH/DELETE /api/stores` | 451 | single-store CRUD | varies |

### 2.2 Backend (RPCs)

| RPC | Líneas | Propósito | Seguridad |
|-----|-------:|-----------|-----------|
| `soft_delete_store(p_store_id, p_deleted_by)` | 72 | Atomic soft-delete + membership cleanup + audit | SECURITY DEFINER |
| `bulk_assign_memberships(p_user_id, p_assignments)` | 64 | Bulk upsert memberships (1-50) | SECURITY DEFINER |
| `get_batch_store_daily_kpis(p_store_ids[], p_date)` | 54 | Batched KPI fetch (N+1 → 1 query) | STABLE SECURITY DEFINER |

### 2.3 Frontend (UI Components)

| Component | Líneas | Propósito |
|-----------|-------:|-----------|
| `StoresManagementView` | 627 | Primary bulk UI — checkbox select, sticky bar, confirm modal |
| `StoreCard` | 522 | Per-store card with bulk-select checkbox |
| `BulkApplyTemplateModal` | 200 | Apply FC template to multiple stores |
| `StoreCompareModal` | 318 | Compare 2-4 stores side-by-side |
| `BulkStoreAssignModal` | 249 | Bulk assign user to stores |
| `VirtualizedStoreGrid` | 98 | Virtualization for 20+ stores |
| `StoreHealthBadge` | 122 | Health score badge |

### 2.4 Hooks & Services

| Hook/Service | Líneas | Propósito |
|--------------|-------:|-----------|
| `useBulkStoreAction` | ~30 | React Query mutation for bulk ops |
| `storeApiClient.bulkStoreAction` | ~18 | Fetch wrapper for POST /api/stores/bulk |
| `useStoreHealth` | 181 | Compute 0-100 health score |
| `useMultiStoreDashboard` | 263 | Batched KPI fetch with chunking |
| `useStoreComparison` | 99 | Fetch comparison KPIs for 2-4 stores |

---

## 3. Hallazgos de Auditoría

### H-08-01: No existe bulk archive / bulk restore (Medio)

**Severidad:** Medio
**Categoría:** Funcionalidad faltante

**Descripción:**
El endpoint `POST /api/stores/bulk` soporta solo `activate`, `deactivate`, `delete`. No soporta `archive` ni `restore`. Las operaciones de archive/restore son single-store-only (`POST /api/stores/[id]/archive` y `POST /api/stores/[id]/restore`).

**Impacto:**
Si un admin quiere archivar 10 tiendas, debe hacer 10 llamadas HTTP separadas. No hay UX para seleccionar múltiples tiendas y archivarlas en lote.

**Riesgo:**
- Ineficiencia operativa (10 requests en lugar de 1)
- Inconsistencia: el UI muestra "bulk" para activate/deactivate/delete pero no para archive/restore
- Mayor superficie de error (algunas tiendas pueden archivarse y otras no, sin reporte consolidado)

**Recomendación:**
Extender `bulkActionSchema` para incluir `'archive'` y `'restore'`:
```typescript
action: z.enum(['activate', 'deactivate', 'delete', 'archive', 'restore'])
```
Y en el handler, para `archive`/`restore`, hacer `Promise.allSettled` de UPDATEs (mismo patrón que activate/deactivate).

---

### H-08-02: Rate limit por hora NO se aplica (Alto)

**Severidad:** Alto
**Categoría:** Seguridad / Rate limiting

**Descripción:**
`PLAN_LIMITS` en `tenant-limiter.ts` define `bulkOpsPerHour`:
- `free`: 1 bulk op/hora
- `pro`: 20 bulk ops/hora
- `enterprise`: unlimited

Pero el handler `POST /api/stores/bulk` solo llama `checkTenantRateLimit()` que verifica el límite **por minuto** (`rateLimitPerMinute`), no el límite **por hora** (`bulkOpsPerHour`).

**Impacto:**
Un usuario `free` puede hacer 5 bulk ops/minuto (rate limit por minuto) × 60 minutos = 300 bulk ops/hora, cuando el límite debería ser 1/hora.

**Riesgo:**
- Abuso del endpoint bulk por usuarios free
- Costo operacional elevado (cada bulk op puede afectar 50 tiendas)

**Recomendación:**
Agregar verificación del límite por hora antes del execute:
```typescript
const hourlyRl = await checkBulkOpsHourlyLimit(session.user.id, plan);
if (!hourlyRl.allowed) {
  return NextResponse.json(createApiError('BULK_OP_HOURLY_LIMIT'), { status: 429 });
}
```

---

### H-08-03: `soft_delete_store` no valida dependencias antes de borrar (Alto)

**Severidad:** Alto
**Categoría:** Integridad de datos

**Descripción:**
La función `soft_delete_store(p_store_id, p_deleted_by)` hace:
1. `UPDATE stores SET is_active = false`
2. `UPDATE user_store_memberships SET status = 'revoked'`
3. `UPDATE profiles SET active_store_id = NULL`
4. `INSERT INTO audit_logs`

Pero **NO valida** si la tienda tiene:
- Transacciones pendientes (transfers PENDIENTE)
- Recepciones pendientes
- Pedidos de compra abiertos
- Sesiones de caja abiertas
- Cierres fiscales pendientes
- Reservas de inventario activas

**Impacto:**
Soft-delete de una tienda con operaciones pendientes deja el sistema en estado inconsistente. Las transferencias pendientes no se pueden confirmar (la tienda origen/destino está inactiva). Las recepciones pendientes quedan huérfanas.

**Riesgo:**
- Datos huérfanos (transfers, receipts, purchase_orders sin tienda activa)
- Operaciones pendientes que no se pueden completar
- Inconsistencia contable (cash_sessions abiertas sin tienda activa)

**Recomendación:**
Agregar validación previa en `soft_delete_store`:
```sql
-- Verificar dependencias críticas
SELECT
  (SELECT count(*) FROM transfers WHERE (origin_store_id = p_store_id OR destination_store_id = p_store_id) AND status = 'PENDIENTE') as pending_transfers,
  (SELECT count(*) FROM receipts WHERE store_id = p_store_id AND status NOT IN ('CANCELLED', 'CONFIRMED')) as pending_receipts,
  (SELECT count(*) FROM cash_sessions WHERE store_id = p_store_id AND status = 'OPEN') as open_cash_sessions,
  (SELECT count(*) FROM inventory_reservations WHERE store_id = p_store_id AND status = 'ACTIVE') as active_reservations
INTO v_deps;

IF v_deps.pending_transfers > 0 OR v_deps.pending_receipts > 0 OR ... THEN
  RAISE EXCEPTION 'ERR_STORE_HAS_PENDING_OPERATIONS: %', v_deps;
END IF;
```

---

### H-08-04: Bulk delete usa `Promise.allSettled` sin transacción atómica (Alto)

**Severidad:** Alto
**Categoría:** Consistencia transaccional

**Descripción:**
El handler bulk delete hace:
```typescript
const results = await Promise.allSettled(
  allowedIds.map(async (storeId) => {
    const { error } = await admin.rpc('soft_delete_store', { p_store_id: storeId, p_deleted_by: session.user.id });
    if (error) throw error;
    return storeId;
  })
);
```

Esto ejecuta N llamadas RPC independientes. Si la tienda 3 de 5 falla, las tiendas 1-2 ya fueron borradas y las tiendas 4-5 se intentan. **No hay rollback** de las tiendas ya borradas.

**Impacto:**
Bulk delete de 50 tiendas donde 5 fallan → 45 tiendas borradas, 5 no borradas. El usuario recibe `{ affected: 45, failed: 5 }` pero no hay forma de deshacer las 45 borradas.

**Riesgo:**
- Operación parcial sin rollback
- Estado inconsistente si el usuario esperaba "todo o nada"
- Difícil recuperación (las 45 tiendas borradas tienen memberships revocadas)

**Recomendación:**
Opción A (preferida): Crear RPC `bulk_soft_delete_stores(p_store_ids[], p_deleted_by)` que ejecute todo en una transacción:
```sql
BEGIN
  FOR each store_id:
    soft_delete_store(store_id, deleted_by)
  END LOOP
EXCEPTION WHEN OTHERS THEN
  ROLLBACK
  RAISE
END
```

Opción B: Documentar explícitamente que bulk delete es "best-effort" (no atómico) y agregar confirmación UI más fuerte.

---

### H-08-05: `bulk_assign_memberships` no valida conflictos de rol (Medio)

**Severidad:** Medio
**Categoría:** Validación de negocio

**Descripción:**
La función `bulk_assign_memberships(p_user_id, p_assignments)` hace `INSERT ... ON CONFLICT DO UPDATE` pero no valida:
- Si el usuario ya tiene rol `admin` en otra tienda y se le asigna `clerk` (degradación)
- Si el usuario excede el límite de tiendas de su plan
- Si el `store_id` existe y está activo

**Impacto:**
Un usuario puede ser degradado silenciosamente de `admin` a `clerk` en una tienda sin notificación. También puede exceder su límite de tiendas del plan.

**Riesgo:**
- Cambios de rol no intencionados
- Violación de límites del plan
- Asignaciones a tiendas inactivas/archivadas

**Recomendación:**
Agregar validaciones en `bulk_assign_memberships`:
- Verificar que el `store_id` existe y `is_active = true`
- Verificar límite de tiendas del plan del usuario
- Si el rol cambia de `admin` → `clerk`, requerir confirmación explícita

---

### H-08-06: No hay bulk create stores (Bajo)

**Severidad:** Bajo
**Categoría:** Funcionalidad faltante

**Descripción:**
No existe endpoint ni RPC para crear múltiples tiendas en una sola operación. La creación es single-store vía `POST /api/stores` → `create_store_with_membership` RPC.

**Impacto:**
Para onboarding de múltiples tiendas (ej. franquicia con 10 locales), el admin debe hacer 10 requests separadas.

**Riesgo:**
- Bajo: la creación de tiendas es infrecuente
- Ineficiencia operativa en escenarios de onboarding masivo

**Recomendación:**
Evaluar si vale la pena implementar `bulk_create_stores`. Si se implementa, requiere:
- Validación de límite del plan (máximo tiendas según plan)
- Transacción atómica (todas o ninguna)
- Creación de memberships automáticas para el creador

---

### H-08-07: `Promise.allSettled` para activate/deactivate no es atómico (Medio)

**Severidad:** Medio
**Categoría:** Consistencia

**Descripción:**
Bulk activate/deactivate usa:
```typescript
const results = await Promise.allSettled(
  allowedIds.map(async (storeId) => {
    const { error } = await admin.from('stores').update({ is_active: isActive }).eq('id', storeId);
    if (error) throw error;
    return 1;
  })
);
```

Cada UPDATE es independiente. Si 3 de 5 fallan, 2 se actualizan y 3 no.

**Impacto:**
Bulk activate de 5 tiendas donde 3 fallan → 2 activadas, 3 no. El usuario recibe `{ affected: 2, failed: 3 }` pero no hay rollback.

**Riesgo:**
- Menos grave que H-08-04 (activate/deactivate es reversible)
- Pero puede dejar tiendas en estado mixto (algunas activas, otras no) sin intención

**Recomendación:**
Para activate/deactivate, usar un UPDATE con `IN`:
```typescript
const { data, error } = await admin
  .from('stores')
  .update({ is_active: isActive })
  .in('id', allowedIds)
  .select('id');
// data.length = filas realmente actualizadas
```
Esto es atómico y más eficiente (1 query en lugar de N).

---

### H-08-08: No hay auditoría previa al bulk execute (Medio)

**Severidad:** Medio
**Categoría:** Trazabilidad

**Descripción:**
El bulk handler registra en `audit_logs` después de completar (dentro de `soft_delete_store`), pero no hay un log previo que capture:
- Tiempo de inicio
- IP del caller
- Tamaño del batch
- Idempotency key
- Plan del usuario

**Impacto:**
Si el bulk operation falla a mitad, no hay registro de qué se intentó hacer (solo de qué se completó).

**Riesgo:**
- Falta de trazabilidad para operaciones destructivas
- Difícil debugging de fallos parciales

**Recomendación:**
Insertar un log de auditoría previo al execute:
```sql
INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
VALUES (
  'bulk_action_initiated',
  'stores',
  NULL,
  NULL,
  jsonb_build_object(
    'action', p_action,
    'store_ids', p_store_ids,
    'initiated_by', p_user_id,
    'initiated_at', now(),
    'ip', p_ip,
    'plan', p_plan
  )
);
```

---

### H-08-09: `canManageStore` se ejecuta N veces en el handler (Bajo)

**Severidad:** Bajo
**Categoría:** Performance

**Descripción:**
El handler filtra storeIds con:
```typescript
const allowedIds = storeIds.filter(id => canManageStore(session.user, id));
const deniedIds = storeIds.filter(id => !canManageStore(session.user, id));
```

`canManageStore` para admin global siempre retorna `true`, pero la función se ejecuta 2N veces (50 tiendas × 2 filter passes = 100 llamadas).

**Impacto:**
- Para admin: insignificante (solo check de rol)
- Para manager: si `canManageStore` hace query a DB (memberships), serían 100 queries

**Riesgo:**
- Bajo: admin es el caso típico
- Performance degradada si se relaja el rol a manager

**Recomendación:**
Para admin, early-return:
```typescript
if (session.user.role === 'admin') {
  allowedIds = storeIds;
  deniedIds = [];
} else {
  // filter with canManageStore (and cache memberships)
}
```

---

### H-08-10: Confirmación UI "BULK" no se valida server-side (Medio)

**Severidad:** Medio
**Categoría:** Seguridad / Defense in depth

**Descripción:**
El UI requiere que el usuario escriba "BULK" para confirmar bulk delete. Pero el backend no valida esta confirmación — cualquier request con `action: 'delete'` y storeIds válidos se ejecuta.

**Impacto:**
Un atacante con credenciales admin puede bypassar la confirmación UI haciendo un POST directo al API.

**Riesgo:**
- Bajo: requiere credenciales admin
- Pero la confirmación UI da falsa sensación de seguridad

**Recomendación:**
Agregar campo `confirmation_text` al schema:
```typescript
const bulkActionSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete', 'archive', 'restore']),
  confirmation_text: z.string().optional(),
}).refine(
  (data) => data.action !== 'delete' || data.confirmation_text === 'BULK',
  { message: 'Confirmation text "BULK" required for delete action' }
);
```

---

## 4. Resumen de Hallazgos

| ID | Severidad | Categoría | Descripción |
|----|-----------|-----------|-------------|
| H-08-01 | Medio | Funcionalidad | No existe bulk archive / bulk restore |
| H-08-02 | **Alto** | Seguridad | Rate limit por hora NO se aplica |
| H-08-03 | **Alto** | Integridad | `soft_delete_store` no valida dependencias |
| H-08-04 | **Alto** | Consistencia | Bulk delete no es atómico (Promise.allSettled) |
| H-08-05 | Medio | Validación | `bulk_assign_memberships` no valida conflictos de rol |
| H-08-06 | Bajo | Funcionalidad | No hay bulk create stores |
| H-08-07 | Medio | Consistencia | Bulk activate/deactivate no es atómico |
| H-08-08 | Medio | Trazabilidad | No hay auditoría previa al bulk execute |
| H-08-09 | Bajo | Performance | `canManageStore` se ejecuta 2N veces |
| H-08-10 | Medio | Seguridad | Confirmación UI "BULK" no se valida server-side |

**Score:** 6.5/10 — Funcional pero con riesgos de consistencia y seguridad

---

## 5. Próximos Pasos

1. **Presentar este audit al usuario** para aprobación
2. **Proponer arquitectura** para remediar H-08-02, H-08-03, H-08-04 (los 3 hallazgos Altos)
3. **Diseñar pruebas** antes de implementar
4. **No implementar cambios** hasta aprobación del diseño final

---

## 6. Preguntas para el Usuario

1. ¿Quieres que implemente bulk archive/restore (H-08-01) o solo remedio los hallazgos Altos?
2. ¿Para H-08-04 (bulk delete atómico), prefieres RPC `bulk_soft_delete_stores` o documentar como "best-effort"?
3. ¿Para H-08-03 (validar dependencias), qué operaciones pendientes deben bloquear el soft-delete? (transfers, receipts, cash_sessions, inventory_reservations, todas)
4. ¿Para H-08-10 (confirmación server-side), requiere `confirmation_text='BULK'` solo para delete o también para archive?
