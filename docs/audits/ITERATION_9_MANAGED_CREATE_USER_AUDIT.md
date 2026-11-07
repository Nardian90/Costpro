# Iteración 9 — Managed Create User Audit

**Fecha:** 2026-08-02
**Iteración:** 9 — Managed Create User
**Fase:** Auditoría del diseño actual + arquitectura propuesta (sin modificar código)
**Estado:** Pendiente aprobación del usuario

---

## 1. Estado Actual

### 1.1 Modelo de Identidad

```
auth.users (Supabase Auth)
    │
    ├── 1:1 ─── profiles (id = auth.users.id)
    │              ├── role (user_role enum: admin, encargado, clerk, warehouse, costo)
    │              ├── role_id (FK → roles table)
    │              ├── tenant_id (FK → tenants) ⚠️ 17/18 son NULL
    │              ├── active_store_id (FK → stores)
    │              ├── plan (TEXT: free, pro, enterprise)
    │              ├── max_stores_limit, max_users_limit
    │              ├── created_by (FK → auth.users)
    │              └── is_active
    │
    ├── 1:N ─── user_store_memberships
    │              ├── user_id (FK → profiles, ON DELETE CASCADE)
    │              ├── store_id (FK → stores, ON DELETE CASCADE)
    │              ├── role (user_role enum)
    │              ├── status (membership_status enum: active, revoked)
    │              └── UNIQUE(user_id, store_id)
    │
    └── 1:N ─── user_audit_log
                   ├── performed_by (FK → profiles)
                   ├── target_user_id (FK → profiles)
                   └── action, old_values, new_values

tenants (id, name, created_at, updated_at)
roles (id, name, permissions JSONB, is_default)
    ├── Admin (all views, is_default=false)
    ├── Encargado (Dashboard, Inventory, POS, Reports, Users, Costs)
    ├── Cajero (POS)
    ├── Almacenero (Inventory)
    └── costo (Costs, is_default=true)
```

### 1.2 Roles Actuales — Comportamiento Real

Verificado en DB (18 profiles, 21 memberships):

#### Global roles (profiles.role)

| Rol | Count | Qué puede crear | Qué puede modificar | Qué puede asignar | Restricciones |
|-----|------:|------------------|---------------------|-------------------|---------------|
| `admin` | 2 | Cualquier rol (incluido admin) | Cualquier usuario | Cualquier tienda | Sin restricciones |
| `encargado` | 3 | clerk, warehouse, costo, encargado (NO admin) | Usuarios de sus tiendas | Solo tiendas donde tiene membership activa | `has_store_access` check en RPC |
| `clerk` | 1 | ❌ No puede crear usuarios | ❌ | ❌ | Solo operaciones POS |
| `warehouse` | 1 | ❌ No puede crear usuarios | ❌ | ❌ | Solo gestión inventario |
| `costo` | 11 | ❌ No puede crear usuarios | ❌ | ❌ | Solo módulo costos |

#### Membership roles (user_store_memberships.role)

| Rol | Active | Revoked | Nota |
|-----|-------:|--------:|------|
| `admin` | 8 | 5 | Membership admin ≠ global admin |
| `manager` | 1 | 0 | ⚠️ No existe como global role — inconsistencia |
| `clerk` | 3 | 0 | |
| `warehouse` | 1 | 0 | |
| `encargado` | 1 | 0 | |
| `costo` | 2 | 0 | |

### 1.3 Flujo Actual de Creación de Usuarios

```
Admin llena UserForm
    │
    ▼
POST /api/users/managed-create
    │
    ├── 1. withRole('admin') — valida rol
    ├── 2. CSRF + rate limit + Zod validation
    ├── 3. Hierarchy check: encargado → no puede crear admin
    ├── 4. supabaseAdmin.auth.admin.createUser() — crea auth.users
    │      (si no hay password → generateLink recovery email)
    ├── 5. Llama RPC managed_create_user()
    │      ├── Verifica p_creator_id == auth.uid()
    │      ├── Verifica rol del caller (admin o encargado)
    │      ├── Verifica hierarchy (encargado no crea admin)
    │      ├── Crea/actualiza profile (INSERT ... ON CONFLICT)
    │      ├── Crea memberships (con has_store_access check)
    │      └── ⚠️ NO setea tenant_id
    │
    ├── 6. Si RPC falla (trigger error):
    │      └── Fallback path (3 writes NO atómicos):
    │          ├── UPDATE profile
    │          ├── UPSERT memberships
    │          └── UPDATE active_store_id (sin rollback si falla)
    │
    ├── 7. Si RPC falla (otro error):
    │      └── auth.admin.deleteUser(userId) — cleanup
    │
    └── 8. Si generateLink falla:
           └── NO rollback (usuario creado sin email)
```

### 1.4 Flujo Actual de Eliminación de Usuarios

```
POST /api/users/delete
    │
    ├── 1. withRole('admin') + self-delete prevention
    ├── 2. Llama RPC managed_delete_user(p_user_id)
    │      ├── Verifica dependencias (sales, receipts, transfers, etc.)
    │      └── Borra profile + memberships (CASCADE)
    │
    ├── 3. auth.admin.deleteUser(userId)
    │      └── ⚠️ Si falla → orphaned auth.users (login still works)
    │
    └── 4. Si step 2 falla pero step 3 no: usuario sin profile pero auth activo
```

---

## 2. Hallazgos Clasificados

### Críticos (2)

#### H-09-01 (Crítico): RPCs bulk sin auth check interno — acceso directo vía PostgREST

**Severidad:** Crítico
**Categoría:** Escalamiento de privilegios / Bypass de RLS

**Descripción:**
Los RPCs `bulk_soft_delete_stores`, `generate_bulk_confirmation_token`, y `generate_bulk_override_token` están granted a `authenticated` y `anon` pero **NO verifican el rol del caller** internamente. La validación `withRole('admin')` solo está en los API routes de Next.js.

Cualquier usuario autenticado puede llamar directamente:
```http
POST /rest/v1/rpc/bulk_soft_delete_stores
{
  "p_store_ids": ["..."],
  "p_deleted_by": "su-uid",
  "p_confirmation_token": "token-que-él-mismo-generó"
}
```

**Impacto:**
- Usuario no-admin puede generar tokens y ejecutar bulk delete
- Bypass completo del check `withRole('admin')`
- Bypass de la confirmación `BULK_DELETE` (que es solo Zod en el API route)

**Recomendación:**
Agregar auth check al inicio de cada RPC bulk:
```sql
DECLARE v_caller_role TEXT;
SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
  RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar esta operación';
END IF;
```

#### H-09-02 (Crítico): Nuevos usuarios reciben `tenant_id = NULL`

**Severidad:** Crítico
**Categoría:** Multi-tenancy / Bypass de aislamiento

**Descripción:**
`managed_create_user` NO setea `tenant_id` en el profile. Verificado: 17 de 18 profiles tienen `tenant_id = NULL`.

La función `has_store_access` trata NULL como "sin restricción":
```sql
AND (
  p.tenant_id IS NULL        -- ← si NULL, no verifica
  OR s.tenant_id IS NULL
  OR p.tenant_id = s.tenant_id
)
```

**Impacto:**
- Nuevo usuario creado por admin de tenant A puede acceder a tiendas de tenant B
- Violación de aislamiento multi-tenant

**Recomendación:**
`managed_create_user` debe heredar `tenant_id` del creator:
```sql
DECLARE v_creator_tenant_id UUID;
SELECT tenant_id INTO v_creator_tenant_id FROM public.profiles WHERE id = v_auth_uid;
-- En el INSERT del profile:
tenant_id = v_creator_tenant_id
```

### Altos (3)

#### H-09-03 (Alto): Fallback path no atómico en managed-create

**Descripción:**
El fallback path (3 writes separados sin transacción) puede dejar estado inconsistente. El UPDATE de `active_store_id` no tiene rollback si falla.

**Recomendación:**
Eliminar el fallback path arreglando el trigger issue, o envolver en transacción SQL.

#### H-09-04 (Alto): managed_delete_user deja auth.users huérfano

**Descripción:**
Si `auth.admin.deleteUser` falla después de que `managed_delete_user` ya borró el profile, el usuario puede seguir iniciando sesión.

**Recomendación:**
Invertir el orden: `auth.admin.deleteUser` primero → CASCADE borra profile automáticamente.

#### H-09-05 (Alto): `profiles.email` sin UNIQUE constraint

**Descripción:**
`auth.users` tiene UNIQUE en email, pero `profiles` no. Posible duplicación de profiles.

**Recomendación:**
Agregar `UNIQUE(email)` constraint a `profiles`.

### Medios (3)

| ID | Hallazgo |
|----|----------|
| H-09-06 | Dev-bypass token grants admin on ALL stores (non-prod) |
| H-09-07 | Plan enum inconsistente (`basico/profesional` vs `free/pro`) |
| H-09-08 | `manager` role en memberships pero no es global role válido |

### Bajos (4)

| ID | Hallazgo |
|----|----------|
| H-09-09 | Password min length: 8 vs 6 inconsistente |
| H-09-10 | `resetPasswordSchema` tiene `new_password` field no usado |
| H-09-11 | Bulk memberships route no usa `getSupabaseAdminSafe()` |
| H-09-12 | No hay pre-check de email existente |

**Score:** 5.0/10 — Funcional pero con 2 riesgos críticos de seguridad

---

## 3. Arquitectura Propuesta

### 3.1 Principios

1. **Defense in depth:** Auth checks en API routes Y en RPCs
2. **Tenant isolation obligatoria:** `tenant_id` nunca NULL
3. **Atomicidad:** Crear usuario + profile + memberships en una transacción
4. **Rollback completo:** Si cualquier paso falla, deshacer todo
5. **No orphaned users:** auth.users y profiles siempre en sync

### 3.2 Flujo Propuesto — Crear Usuario

```
Admin llena UserForm
    │
    ▼
POST /api/users/managed-create
    │
    ├── 1. withRole('admin') + CSRF + rate limit + Zod
    ├── 2. Pre-check: email existe en profiles? → 409 si sí
    ├── 3. supabaseAdmin.auth.admin.createUser()
    ├── 4. Llama RPC managed_create_user_v2()
    │      ├── Auth check: caller es admin o encargado
    │      ├── Heredar tenant_id del creator
    │      ├── Crear profile (con tenant_id)
    │      ├── Crear memberships (con has_store_access + tenant check)
    │      ├── Setear active_store_id
    │      └── Auditar en user_audit_log
    │      (TODO en una transacción atómica)
    │
    ├── 5. Si RPC falla:
    │      └── auth.admin.deleteUser() — cleanup completo
    │
    └── 6. Si generateLink falla:
           └── Log warning, NO rollback (usuario creado)
```

### 3.3 Flujo Propuesto — Eliminar Usuario

```
POST /api/users/delete
    │
    ├── 1. withRole('admin') + self-delete prevention
    ├── 2. auth.admin.deleteUser(userId) PRIMERO
    │      └── CASCADE borra profile + memberships automáticamente
    ├── 3. Si auth delete falla:
    │      └── Retornar 500, NO borrar profile (usuario intacto)
    └── 4. Auditar en user_audit_log
```

### 3.4 Flujo UI Propuesto

```
[UsersManagementView]
    │
    ├── Click "Nuevo Usuario"
    │
    ▼
[UserForm]
    │
    ├── Datos: nombre, email, password (opcional)
    ├── Rol: select (filtrado por hierarchy)
    ├── Tiendas: BulkStoreAssignModal
    ├── Plan: select (unificado: free/pro/enterprise)
    │
    ▼
[Preview] (nuevo step)
    │
    ├── Resumen: nombre, email, rol, tiendas, plan
    ├── Validación de dependencias
    ├── Si encargado: verificar que tiene acceso a todas las tiendas
    │
    ▼
[Confirmación]
    │
    ├── Para admin: confirmación simple
    ├── Para encargado creando admin: ❌ bloqueado
    │
    ▼
[Execute] → toast success/failure
```

---

## 4. Migraciones Previstas

### Migration 1: `20260802000010_v2_12_49_managed_create_user_safety.sql`

```sql
-- 1. Consolidar managed_create_user (v7 — versión definitiva)
--    - Heredar tenant_id del creator
--    - Auth check interno (admin o encargado)
--    - Transacción atómica (sin fallback path)
--    - Auditar en user_audit_log

-- 2. Auth checks en RPCs bulk (R-08-SEC-01)
--    - bulk_soft_delete_stores: verificar admin
--    - generate_bulk_confirmation_token: verificar admin
--    - generate_bulk_override_token: verificar admin
--    - soft_delete_store: verificar admin

-- 3. REVOKE EXECUTE de anon en RPCs sensibles
REVOKE EXECUTE ON FUNCTION bulk_soft_delete_stores FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_bulk_confirmation_token FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_bulk_override_token FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION soft_delete_store FROM anon, PUBLIC;

-- 4. UNIQUE constraint en profiles.email
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- 5. Set tenant_id for existing NULL profiles
UPDATE public.profiles SET tenant_id = (
  SELECT tenant_id FROM public.stores WHERE id = profiles.active_store_id
) WHERE tenant_id IS NULL AND active_store_id IS NOT NULL;
```

### Migration 2: Cambios TypeScript (no SQL)

- Modificar `POST /api/users/managed-create` para usar RPC v2 (sin fallback)
- Modificar `POST /api/users/delete` para auth delete primero
- Unificar plan enum
- Unificar password min length a 8
- Agregar pre-check de email existente
- Usar `getSupabaseAdminSafe()` en bulk memberships route

---

## 5. Endpoints Necesarios

### Modificados (2)

| Endpoint | Cambio |
|----------|--------|
| `POST /api/users/managed-create` | Pre-check email + RPC v2 (sin fallback) + rollback completo |
| `POST /api/users/delete` | Auth delete primero → CASCADE |

### Sin cambios (3)

| Endpoint | Estado |
|----------|--------|
| `POST /api/users/toggle-status` | ✅ Sin cambios |
| `POST /api/users/reset-password` | ✅ Sin cambios (limpiar dead field) |
| `POST /api/users/[id]/memberships/bulk` | ✅ Usar `getSupabaseAdminSafe()` |

### Nuevos (0)

No se requieren endpoints nuevos.

---

## 6. Plan de Pruebas PT-9.x

| Test | Descripción | Criterio de aprobación |
|------|-------------|------------------------|
| PT-9.1 | Non-admin no puede llamar RPCs bulk directamente vía PostgREST | 403 ERR_PERMISSION_DENIED |
| PT-9.2 | Nuevo usuario recibe tenant_id del creator | profile.tenant_id = creator.tenant_id |
| PT-9.3 | Usuario con tenant_id NULL no puede acceder a tiendas de otro tenant | has_store_access = false |
| PT-9.4 | Email duplicado rechazado antes de createUser | 409 CONFLICT |
| PT-9.5 | Delete usuario: auth delete primero, CASCADE borra profile | No orphaned auth.users |
| PT-9.6 | Create usuario: si RPC falla, auth.users se borra (rollback) | No orphaned auth.users |
| PT-9.7 | Encargado no puede crear admin | 403 ERR_UNAUTHORIZED |
| PT-9.8 | Plan enum unificado (free/pro/enterprise) | Schema consistente |
| PT-9.9 | Password min 8 chars en todos los schemas | Validación consistente |
| PT-9.10 | Flujo UI completo: create → preview → confirm → execute | Usuario creado correctamente |

---

## 7. Riesgos de Migración

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `UNIQUE(email)` falla por duplicados existentes | Media | Alto | Pre-migration: identificar y resolver duplicados antes de aplicar constraint |
| `tenant_id` heredado incorrecto si creator no tiene tenant | Baja | Medio | Si creator.tenant_id IS NULL, usar store.tenant_id de la primera membership |
| RPC consolidado rompe callers existentes | Baja | Alto | La API route es el único caller — actualizar simultáneamente |
| Auth delete primero puede fallar si auth.users no existe | Baja | Bajo | Try-catch: si auth delete falla con "user not found", continuar con profile delete |

---

## 8. Estado

```
Auditoría:               ✅ Completa
Hallazgos:               12 (2 Críticos, 3 Altos, 3 Medios, 4 Bajos)
Arquitectura propuesta:  ✅ Definida
Migrations previstas:    1 SQL + 1 TypeScript
Endpoints:               2 modificados, 0 nuevos
Plan de pruebas:         PT-9.1 a PT-9.10 (10 pruebas)
Aprobación usuario:      ⏳ Pendiente
```

**Espero tu aprobación antes de aplicar cualquier migration o modificar código.**

---

## 9. Preguntas para el Usuario

1. **H-09-01 (RPCs sin auth):** ¿Apruebas agregar auth checks internos en los 4 RPCs bulk + revoke de anon/PUBLIC?
2. **H-09-02 (tenant_id NULL):** ¿El tenant_id del nuevo usuario debe heredarse del creator, o del store de la primera membership?
3. **H-09-04 (delete order):** ¿Apruebas invertir el orden (auth delete primero → CASCADE)?
4. **H-09-05 (email UNIQUE):** ¿Apruebas agregar UNIQUE constraint? (requiere pre-migration para resolver duplicados si los hay)
5. **H-09-06 (dev-bypass):** ¿Eliminar completamente o solo gatear por NODE_ENV !== 'production'?
6. **H-09-07 (plan enum):** ¿Unificar a `free/pro/enterprise`?
