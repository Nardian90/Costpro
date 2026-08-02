# Iteración 9 — Managed Create User Audit

**Fecha:** 2026-08-02
**Iteración:** 9 — Managed Create User
**Fase:** Auditoría del diseño actual (sin modificar código)
**Estado:** En progreso

---

## 1. Resumen Ejecutivo

El flujo "Managed Create User" es un sistema maduro de ~9.3k LOC que abarca 5 API routes, 30+ migraciones SQL, 7 componentes React, y 3 módulos service/hook. Está **admin-gated, RBAC-enforced, CSRF-protected, rate-limited, audit-logged, y tiene rollback en fallo parcial**.

Sin embargo, hay **2 hallazgos críticos** y varios concerns de seguridad:

- **H-09-01 (Crítico):** `managed_create_user` RPC tiene 6 redefinitions; v6 eliminó `p_creator_id` pero la API route aún lo pasa → fallo runtime enmascarado por fallback path
- **H-09-02 (Crítico):** Nuevos usuarios reciben `tenant_id = NULL` → `has_store_access` lo trata como "sin restricción de tenant" → posible acceso cross-tenant

---

## 2. Inventario de Componentes

### 2.1 API Routes (5)

| Endpoint | Líneas | Auth | Propósito |
|----------|-------:|------|-----------|
| `POST /api/users/managed-create` | 229 | `withRole('admin')` | Crear usuario (auth.users + profile + memberships) |
| `POST /api/users/[id]/memberships/bulk` | 114 | `withAuth` + manual check | Bulk asignar memberships (1-50 tiendas) |
| `POST /api/users/toggle-status` | 102 | `withRole('admin')` | Activar/desactivar usuario |
| `POST /api/users/delete` | 89 | `withRole('admin')` | Eliminar usuario (profile + auth.users) |
| `POST /api/users/reset-password` | 85 | `withRole('admin')` | Enviar email de reseteo de contraseña |

### 2.2 RPCs

| RPC | Versiones | Estado actual |
|-----|-----------|---------------|
| `managed_create_user` | **6 redefinitions** ⚠️ | v6 (`20260326_multi_tenant_hardening.sql`) — eliminó `p_creator_id` |
| `bulk_assign_memberships` | 1 | ✅ Operativa |
| `manage_user_memberships` | 3 redefinitions | v3 (`20260223_unify_and_cleanup_memberships.sql`) |
| `managed_delete_user` | 2 redefinitions | v2 (`20260317_fix_safe_delete_user.sql`) |

### 2.3 UI Components (7)

| Componente | Líneas | Propósito |
|------------|-------:|-----------|
| `UsersManagementView.tsx` | 246 | Vista admin principal (tabla de usuarios) |
| `UserForm.tsx` | 587 | Formulario create/edit (react-hook-form + Zod) |
| `UserFormModal.tsx` | 76 | Wrapper modal |
| `BulkStoreAssignModal.tsx` | 249 | Multi-store selection |
| `useUsersView.ts` | 262 | View-model hook (CRUD + toasts) |
| `RoleForm.tsx` | 183 | CRUD para tabla `roles` |
| `RolesManagementView.tsx` | 172 | Vista de gestión de roles |
| `StoreTeamModal.tsx` | 256 | Vista inversa (usuarios por tienda) |

### 2.4 Hooks/Services

| Hook/Service | Líneas | Propósito |
|--------------|-------:|-----------|
| `useUsers.ts` | 250 | Hooks: useUsers, useCreateUser, useUpdateUser, useManageUserMemberships, useBulkAssignMemberships |
| `user-service.ts` | 196 | setActiveStore, logout, updateAISettings, getUserProfile |
| `useRoles.ts` | 89 | CRUD roles |
| `useStoreTeam.ts` | 154 | Team por tienda |
| `roles.ts` | 106 | getAllowedRoles, hasRole, canManageStore |
| `auth-middleware.ts` | 405 | withAuth, withRole, withStoreAccess + dev-bypass |

---

## 3. Modelo de Datos

### 3.1 `profiles` table

| Columna | Tipo | Origen migration |
|---------|------|------------------|
| `id` | UUID (PK, FK→auth.users) | Core |
| `email` | TEXT | Core |
| `full_name` | TEXT | Core |
| `role` | user_role enum | Core |
| `is_active` | BOOLEAN | Core |
| `store_id` | UUID (legacy) | Core |
| `active_store_id` | UUID FK→stores | `20260118_multi_store_base` |
| `max_stores_limit` | INT | `20260118_multi_store_base` |
| `max_users_limit` | INT | `20260118_multi_store_base` |
| `created_by` | UUID FK→auth.users | `20260118_multi_store_base` |
| `role_id` | UUID FK→roles | `20260302_0002_create_roles_table` |
| `tenant_id` | UUID FK→tenants | `20260324_total_remediation` |
| `plan` | TEXT | (alignment) |
| `logo_url` | TEXT | `20260201_alignment_fix` |
| `roles` | user_role[] (legacy) | `20260201_alignment_fix` |
| `ai_provider`, `ai_api_key` | TEXT | (AI feature) |

### 3.2 `user_store_memberships` table

```sql
CREATE TABLE public.user_store_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'clerk',
    status membership_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, store_id)
);
```

### 3.3 `tenants` table

```sql
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 `roles` table

5 roles estándar: Admin, Encargado, Cajero, Almacenero, UserCosto (default para signup público)

### 3.5 Relaciones

```
auth.users (1) ─── (1) profiles (1) ─── (N) user_store_memberships (N) ─── (1) stores
                         │
                         └── (N) tenants
                         └── (N) roles
```

---

## 4. Roles Existentes

### Global roles (profiles.role enum)

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `admin` | Administrador global | Acceso total, puede crear usuarios |
| `encargado` | Encargado de tienda | Gestiona usuarios de sus tiendas (no admin) |
| `clerk` | Cajero | Operaciones POS |
| `warehouse` | Almacenero | Gestión de inventario |
| `costo` | Usuario de costos | Módulo de costos |
| `manager` | ⚠️ Solo membership, no global | (inconsistencia) |
| `usuario` | Legacy | (no usado) |
| `superadmin` | ⚠️ Aceptado en schema pero no en enum | (inconsistencia) |

### Membership roles (user_store_memberships.role)

Mismo enum que global, pero `manager` es válido aquí.

---

## 5. Hallazgos de Auditoría

### H-09-01 (Crítico): `managed_create_user` RPC signature mismatch

**Severidad:** Crítico
**Categoría:** Bug runtime + deuda técnica

**Descripción:**
La función `managed_create_user` tiene **6 redefinitions** across migrations:
- v1 (`20260118`): Crea profile + user_store_access (legacy)
- v2 (`20260120`): Agrega `p_memberships`, usa user_store_memberships
- v3 (`20260126`): Inserta en auth.users con password hardcoded `'demo123'`
- v4 (`20260302_0004`): Agrega `p_target_user_id`, usa ON CONFLICT DO UPDATE
- v5 (`20260302_0006`): Agrega `p_creator_id`, usa tabla `roles`
- v6 (`20260326`): **Elimina `p_creator_id`** de la signature

La API route (`managed-create/route.ts:105`) llama con `p_creator_id: session.user.id` que **v6 no acepta**.

**Impacto:**
- El RPC falla con "parameter p_creator_id does not exist"
- La route entra en fallback path (3 writes no atómicos)
- El fallback duplica la lógica que el RPC ya tiene
- Si el fallback también falla, hay rollback parcial

**Riesgo:**
- Fallo silencioso enmascarado por fallback
- Deuda técnica acumulada (6 versiones de la misma función)
- Dificultad para mantener el código

**Recomendación:**
1. Consolidar las 6 versiones en una sola función definitiva
2. Alinear la signature del RPC con lo que la route llama
3. Eliminar el fallback path si el RPC funciona correctamente

---

### H-09-02 (Crítico): Nuevos usuarios reciben `tenant_id = NULL`

**Severidad:** Crítico
**Categoría:** Seguridad / Multi-tenancy

**Descripción:**
La función `managed_create_user` (v6) **NO setea `tenant_id`** en el nuevo profile. El `has_store_access()` function tiene este guard:

```sql
IF v_user_tenant_id IS NOT NULL AND v_store_tenant_id IS NOT NULL THEN
  -- check tenant match
END IF;
```

Si `v_user_tenant_id` es NULL, el check se **skipea** → el usuario puede acceder a cualquier tienda.

**Impacto:**
- Nuevo usuario creado por admin de tenant A puede acceder a tiendas de tenant B
- Violación de aislamiento multi-tenant
- Escalada de privilegios cross-tenant

**Riesgo:**
- Acceso no autorizado a datos de otros tenants
- Violación de compliance/regulatory

**Recomendación:**
1. `managed_create_user` debe heredar `tenant_id` del creator (`p_creator_id` → query profiles.tenant_id)
2. Si el creator no tiene tenant_id, usar el tenant_id del store al que se asigna el usuario
3. Agregar NOT NULL constraint a `profiles.tenant_id` después de migrar datos existentes

---

### H-09-03 (Alto): Fallback path no atómico

**Severidad:** Alto
**Categoría:** Consistencia transaccional

**Descripción:**
El fallback path en `managed-create/route.ts` (líneas 119-198) hace 3 writes separados:
1. UPDATE profile (full_name, role, is_active)
2. UPSERT memberships (bulk)
3. UPDATE profile (active_store_id)

Si el paso 2 falla después del paso 1, el profile existe pero sin memberships. Si el paso 3 falla, **NO hay rollback** — solo un `console.warn`.

**Impacto:**
- Usuario creado sin memberships → no puede acceder a ninguna tienda
- Usuario creado sin active_store_id → puede tener problemas al hacer operaciones

**Riesgo:**
- Usuarios huérfanos (profile sin memberships)
- Estado inconsistente

**Recomendación:**
- Eliminar el fallback path arreglando H-09-01 (que el RPC funcione correctamente)
- O envolver el fallback en una transacción SQL

---

### H-09-04 (Alto): `managed_delete_user` deja auth.users huérfano

**Severidad:** Alto
**Categoría:** Seguridad / Orphaned users

**Descripción:**
El flujo de delete hace:
1. `managed_delete_user` RPC (borra profile + memberships)
2. `auth.admin.deleteUser` (borra auth.users)

Si el paso 2 falla, el auth.users entry persiste → el usuario **puede seguir iniciando sesión** pero no tiene profile.

**Impacto:**
- Login exitoso pero sin profile → comportamiento indefinido
- Posible acceso a datos residuales

**Riesgo:**
- Usuario "fantasma" que puede loguear pero no tiene datos
- Difícil de detectar (el admin cree que borró al usuario)

**Recomendación:**
- Invertir el orden: borrar auth.users primero → CASCADE borra profile automáticamente
- O usar `pg_net` para llamar auth delete desde dentro del RPC

---

### H-09-05 (Medio): `profiles.email` sin UNIQUE constraint

**Severidad:** Medio
**Categoría:** Integridad de datos

**Descripción:**
`auth.users` tiene UNIQUE en email, pero `profiles` no. Si:
1. Usuario A se registra (auth.users + profile)
2. Admin crea usuario con mismo email → `createUser` falla
3. Pero si el fallback path hace UPSERT en profile por ID diferente → 2 profiles con mismo email

**Impacto:**
- Duplicación de profiles
- Confusión en búsqueda de usuarios

**Recomendación:**
Agregar `UNIQUE(email)` constraint a `profiles`.

---

### H-09-06 (Medio): Dev-bypass token grants admin on ALL stores

**Severidad:** Medio
**Categoría:** Seguridad (non-prod)

**Descripción:**
`auth-middleware.ts:64-90` — cuando `ENABLE_DEV_BYPASS=true` y `NODE_ENV !== 'production'`, el token `'dev-token-bypass'` otorga rol admin con memberships en TODAS las tiendas activas.

**Impacto:**
- En desarrollo/staging, cualquier persona con el token dev-bypass tiene acceso total
- Si el flag se activa accidentalmente en producción → breach

**Recomendación:**
- Documentar claramente que solo debe usarse en local dev
- Agregar log warning cuando se activa
- Considerar eliminar en producción builds

---

### H-09-07 (Medio): Plan enum inconsistente

**Severidad:** Medio
**Categoría:** Bug

**Descripción:**
- `UserForm.tsx:21`: `plan: z.enum(['basico', 'profesional', 'enterprise'])`
- `UsersManagementView.tsx:159-162`: usa valores `free / pro / enterprise`
- DB `profiles.plan`: TEXT (sin constraint)

**Impacto:**
- Si el form envía `'basico'` pero el DB espera `'free'` → inconsistencia
- Filtros por plan pueden no funcionar

**Recomendación:**
Unificar el enum de plan en un solo lugar (preferiblemente Zod schema + DB CHECK constraint).

---

### H-09-08 (Bajo): Password min length inconsistente

**Severidad:** Bajo
**Categoría:** Validación

**Descripción:**
- `api-schemas.ts:39`: mínimo 8 chars
- `schemas.ts:654`: mínimo 6 chars

**Recomendación:**
Unificar a 8 chars (estándar moderno).

---

### H-09-09 (Bajo): `resetPasswordSchema` tiene campo `new_password` no usado

**Severidad:** Bajo
**Categoría:** Dead code

**Descripción:**
El schema declara `new_password` pero el handler nunca lo lee — solo usa `generateLink`.

**Recomendación:**
Remover el campo del schema o implementar la funcionalidad.

---

### H-09-10 (Bajo): Bulk memberships route no usa `getSupabaseAdminSafe()`

**Severidad:** Bajo
**Categoría:** DRY violation

**Descripción:**
`bulk/route.ts:64-70` crea su propio admin client inline en lugar de usar `getSupabaseAdminSafe()`.

**Recomendación:**
Usar el factory compartido.

---

### H-09-11 (Bajo): No hay pre-check de email existente

**Severidad:** Bajo
**Categoría:** UX

**Descripción:**
La route no verifica si el email ya existe antes de llamar `createUser`. Confía en el error de Supabase.

**Recomendación:**
Hacer un SELECT en `profiles` por email antes de createUser para dar feedback temprano.

---

### H-09-12 (Bajo): `manager` aceptado como global role en toggle-status

**Severidad:** Bajo
**Categoría:** Inconsistencia

**Descripción:**
`toggle-status/route.ts:54-59` acepta `manager` como global role, pero según `roles.ts` es solo membership role.

**Recomendación:**
Alinear el check con la definición de roles.

---

## 6. Resumen de Hallazgos

| ID | Severidad | Categoría | Descripción |
|----|-----------|-----------|-------------|
| H-09-01 | **Crítico** | Bug + deuda técnica | `managed_create_user` RPC: 6 redefinitions, v6 eliminó `p_creator_id` pero route lo pasa |
| H-09-02 | **Crítico** | Seguridad / Multi-tenancy | Nuevos usuarios reciben `tenant_id = NULL` → acceso cross-tenant |
| H-09-03 | Alto | Consistencia | Fallback path no atómico (3 writes separados) |
| H-09-04 | Alto | Seguridad | `managed_delete_user` deja auth.users huérfano si auth delete falla |
| H-09-05 | Medio | Integridad | `profiles.email` sin UNIQUE constraint |
| H-09-06 | Medio | Seguridad (non-prod) | Dev-bypass token grants admin on ALL stores |
| H-09-07 | Medio | Bug | Plan enum inconsistente (`basico/profesional` vs `free/pro`) |
| H-09-08 | Bajo | Validación | Password min length: 8 vs 6 inconsistente |
| H-09-09 | Bajo | Dead code | `new_password` field en resetPasswordSchema no usado |
| H-09-10 | Bajo | DRY | Bulk memberships route no usa `getSupabaseAdminSafe()` |
| H-09-11 | Bajo | UX | No pre-check de email existente |
| H-09-12 | Bajo | Inconsistencia | `manager` aceptado como global role en toggle-status |

**Score:** 5.5/10 — Funcional pero con 2 riesgos críticos de seguridad

---

## 7. Próximos Pasos

1. **Presentar este audit al usuario** para aprobación
2. **Proponer arquitectura** para remediar H-09-01 y H-09-02 (los 2 críticos)
3. **Diseñar pruebas PT-9.x** antes de implementar
4. **No implementar cambios** hasta aprobación del diseño final

---

## 8. Preguntas para el Usuario

1. ¿Quieres que consolide las 6 versiones de `managed_create_user` en una sola función definitiva?
2. ¿Para H-09-02 (tenant_id NULL), el tenant_id del nuevo usuario debe heredarse del creator o del store al que se asigna?
3. ¿Para H-09-04 (orphaned auth.users), prefieres invertir el orden (auth delete primero → CASCADE) o usar pg_net?
4. ¿El dev-bypass (H-09-06) debe eliminarse completamente o solo en producción builds?
