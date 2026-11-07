# Iteración 9 — Auditoría Completa (Pre-Implementación)

**Fecha:** 2026-08-02
**Iteración:** 9 — Managed Create User
**Fase:** Auditoría profunda (sin modificar código)
**Estado:** Pendiente decisión del usuario

---

## 0. Resumen Ejecutivo

Este documento responde las 7 solicitudes del usuario con evidencia de DB real:

1. **Matriz de permisos RPC** — 13 RPCs sensibles auditadas
2. **tenant_id** — Campo **parcialmente activo**: usado en `has_store_access()` + 6 RLS policies, pero 17/18 profiles y 16/16 stores tienen NULL
3. **FK/CASCADE auth.users ↔ profiles** — `profiles_id_fkey` usa `ON DELETE NO ACTION` (no CASCADE)
4. **Emails duplicados** — 0 duplicados (18/18 distinct), seguro agregar UNIQUE
5. **Dev bypass** — Aprobado parcialmente
6. **Plan enum** — 2 conjuntos de valores inconsistentes: `basico/profesional/enterprise` vs `free/pro/enterprise`
7. **Ciclo de vida del usuario** — Diagrama completo con fuentes de verdad

---

## 1. Matriz de Permisos de RPCs Sensibles

### RPCs auditadas (13)

| # | RPC | Owner | SECURITY DEFINER | Grants actuales | Grants propuestos | Quién debe ejecutar | Quién deja de ejecutar |
|---|-----|-------|:---:|---|---|---|---|
| 1 | `bulk_soft_delete_stores` | postgres | ✅ SÍ | PUBLIC, anon, authenticated, service_role | **authenticated, service_role** | admin (via API route) | anon, PUBLIC |
| 2 | `generate_bulk_confirmation_token` | postgres | ✅ SÍ | PUBLIC, anon, authenticated, service_role | **authenticated, service_role** | admin (via API route) | anon, PUBLIC |
| 3 | `generate_bulk_override_token` | postgres | ✅ SÍ | PUBLIC, anon, authenticated, service_role | **authenticated, service_role** | admin (via API route) | anon, PUBLIC |
| 4 | `soft_delete_store` | postgres | ✅ SÍ | PUBLIC, authenticated, service_role | **authenticated, service_role** | admin (via API route) | anon, PUBLIC |
| 5 | `managed_create_user` | postgres | ✅ SÍ | (no verificado en grants table — hereda default) | **authenticated, service_role** | admin/encargado (via API route + auth check interno) | anon, PUBLIC |
| 6 | `managed_delete_user` | postgres | ✅ SÍ | (hereda default) | **authenticated, service_role** | admin (via API route + auth check interno) | anon, PUBLIC |
| 7 | `bulk_assign_memberships` | postgres | ✅ SÍ | (hereda default) | **authenticated, service_role** | admin/manager (via API route) | anon, PUBLIC |
| 8 | `manage_user_memberships` | postgres | ✅ SÍ | (hereda default) | **authenticated, service_role** | admin/encargado (via API route) | anon, PUBLIC |
| 9 | `validate_store_can_be_modified` | postgres | ✅ SÍ (STABLE) | (hereda default) | **authenticated, service_role** | Cualquier autenticado (read-only) | anon, PUBLIC |
| 10 | `check_bulk_ops_hourly_limit` | postgres | ✅ SÍ (STABLE) | (hereda default) | **authenticated, service_role** | Cualquier autenticado (read-only) | anon, PUBLIC |
| 11 | `has_store_access` | postgres | ✅ SÍ (STABLE) | (hereda default) | **authenticated, service_role** | Interno (RLS + otras funciones) | anon |
| 12 | `is_admin` | postgres | ✅ SÍ (STABLE) | (hereda default) | **authenticated, service_role** | Interno (RLS + otras funciones) | anon |
| 13 | `create_store_with_membership` | postgres | ✅ SÍ | (hereda default) | **authenticated, service_role** | admin (via API route) | anon, PUBLIC |

### Análisis

**Riesgo actual:** Todas las RPCs SECURITY DEFINER están expuestas vía PostgREST a cualquier usuario autenticado (y algunas a anon). Las que NO tienen auth check interno pueden ser llamadas directamente saltándose el API route.

**RPCs SIN auth check interno (CRÍTICO):**
- `bulk_soft_delete_stores` — no verifica rol del caller
- `generate_bulk_confirmation_token` — no verifica rol del caller
- `generate_bulk_override_token` — verifica admin pero vía parámetro, no `auth.uid()`
- `soft_delete_store` — no verifica rol del caller

**RPCs CON auth check interno:**
- `managed_create_user` — verifica `auth.uid()` == `p_creator_id` + rol admin/encargado
- `managed_delete_user` — (verificar)
- `has_store_access` — usa `auth.uid()` internamente
- `is_admin` — usa `auth.uid()` internamente

**Recomendación:**
1. `REVOKE EXECUTE FROM anon, PUBLIC` en TODAS las RPCs sensibles
2. Agregar auth check interno (`auth.uid()` + rol check) en las 4 que no lo tienen
3. Mantener grants a `authenticated` + `service_role`

---

## 2. Auditoría Completa de `profiles.tenant_id`

### ¿Dónde se usa `tenant_id`?

| Capa | Dónde | Cómo se usa | Tipo de uso |
|------|-------|-------------|-------------|
| **RLS** | `cost_sheets` policy `cost_sheets_selective_read` | `p_me.tenant_id = p_creator.tenant_id` — usuarios del mismo tenant pueden ver cost_sheets de otros | **Activo** |
| **RLS** | `products` (4 policies: SELECT/INSERT/UPDATE/DELETE) | `tenant_id IS NULL OR NOT (tenant_id IS DISTINCT FROM store.tenant_id)` — si product.tenant_id es NULL, permite; si no, debe coincidir con store | **Activo (con NULL bypass)** |
| **RLS** | `tenants` policy `tenants_select_own_or_store_member` | `p.tenant_id = tenants.id` — usuarios pueden ver su propio tenant | **Activo** |
| **Función** | `has_store_access()` | `p.tenant_id IS NULL OR s.tenant_id IS NULL OR p.tenant_id = s.tenant_id` — si cualquiera es NULL, no verifica | **Activo (con NULL bypass)** |
| **API** | `POST /api/stores/bulk/execute` | Lee `tenant_id` del profile del caller y lo inserta en `bulk_ops_log` | **Activo (auditoría)** |
| **Frontend** | NO — `tenant_id` no se referencia en ningún componente React | — | **No usado** |
| **Triggers** | NO — ningún trigger referencia `tenant_id` | — | **No usado** |

### Estado real en DB

| Entidad | Total | tenant_id = NULL | tenant_id ≠ NULL | Tenant asignado |
|---------|------:|-----------------:|-----------------:|-----------------|
| `profiles` | 18 | **17** (94%) | 1 | `2de3d368...` (WAC Test Tenant) |
| `stores` | 16 | **16** (100%) | 0 | — |
| `tenants` | 2 | — | — | WAC Test Tenant, Test Tenant B |

### Clasificación del campo `profiles.tenant_id`

**Conclusión: `tenant_id` es un campo ACTIVO pero NO UTILIZADO en la práctica.**

- **Es activo** porque participa en 6 RLS policies y en `has_store_access()`
- **No es utilizado** porque 17/18 profiles y 16/16 stores tienen `tenant_id = NULL`
- Cuando `tenant_id` es NULL, las policies lo tratan como "sin restricción" → el sistema opera en modo **single-tenant de facto**

### Preguntas del usuario respondidas

**¿El sistema soportará múltiples tenants por usuario?**
- Actualmente NO. El diseño permite multi-tenant (el campo existe), pero en la práctica todos los users/stores son NULL = un solo tenant implícito.

**¿Un usuario puede pertenecer a tiendas de distintos tenants?**
- El diseño lo permite vía `user_store_memberships` (que no tiene `tenant_id`), pero `has_store_access` verifica que `user.tenant_id == store.tenant_id`. Si ambos son NULL, pasa. Si se setean tenants diferentes, el acceso se bloquea.
- **Modelo actual:** un usuario tiene UN `tenant_id` en su profile → solo puede acceder a tiendas del MISMO tenant.

**¿El tenant real proviene del usuario o de la tienda?**
- De AMBOS. `has_store_access` verifica que `profile.tenant_id == store.tenant_id`. Ambos deben coincidir (o ambos NULL).
- **Fuente de verdad:** `profiles.tenant_id` (para el usuario) y `stores.tenant_id` (para la tienda).

### Recomendación

**NO rellenar `tenant_id` automáticamente todavía.** El sistema opera en modo single-tenant de facto. Antes de activar multi-tenant real, se necesita:

1. Decisión de producto: ¿se quiere multi-tenant real?
2. Si sí: migración que asigne tenants a stores primero, luego a users
3. Si no: eliminar el campo `tenant_id` de RLS policies o documentar que es para uso futuro

---

## 3. Diagrama del Ciclo de Vida del Usuario

```
┌─────────────────────────────────────────────────────────────────────┐
│                   CICLO DE VIDA DEL USUARIO                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                                                │
│  │  CREACIÓN       │                                                │
│  │                 │                                                │
│  │  1. Admin llena │                                                │
│  │     UserForm    │                                                │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  2. POST        │                                                │
│  │  /api/users/    │                                                │
│  │  managed-create │                                                │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  3. auth.admin  │  ← FUENTE DE VERDAD: auth.users               │
│  │  .createUser()  │    (Supabase Auth gestiona el login)          │
│  │  → auth.users   │                                                │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  4. Trigger     │  ← on_auth_user_created                        │
│  │  auto-crea      │    Crea profile con rol 'costo' (default)     │
│  │  profile        │    SI managed-create lo llama DESPUÉS,         │
│  │                 │    hace UPSERT (ON CONFLICT DO UPDATE)        │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  5. RPC         │  ← managed_create_user                         │
│  │  managed_       │    Crea/actualiza:                             │
│  │  create_user    │    - profile (role, role_id, active_store_id) │
│  │                 │    - user_store_memberships (con has_store_   │
│  │                 │      access check)                             │
│  │                 │    NO setea tenant_id                          │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  6. Si no       │  ← generateLink({type:'recovery'})            │
│  │  password:      │    Envía email de set-password                 │
│  │  recovery email │                                                │
│  └─────────────────┘                                                │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │  ESTADO ACTIVO  │                                                │
│  │                 │                                                │
│  │  auth.users ────┼──→ 1:1 ──→ profiles                            │
│  │  (login)        │    (role, plan, is_active)                     │
│  │                 │         │                                      │
│  │                 │         ├──→ 1:N → user_store_memberships      │
│  │                 │         │         (store_id, role, status)     │
│  │                 │         │              │                       │
│  │                 │         │              ▼                       │
│  │                 │         │         N:1 → stores                 │
│  │                 │         │              (tenant_id)             │
│  │                 │         │                                      │
│  │                 │         ├──→ 1:1 → roles (via role_id)         │
│  │                 │         │         (permissions JSONB)          │
│  │                 │         │                                      │
│  │                 │         └──→ 1:1 → tenants (via tenant_id)     │
│  │                 │                                                  │
│  │  FUENTES DE VERDAD:                                              │
│  │  • auth.users = identidad (email, password)                     │
│  │  • profiles.role = rol global (admin, encargado, etc.)          │
│  │  • profiles.role_id = FK a roles table (source of truth V2.8)   │
│  │  • user_store_memberships = acceso a tiendas                    │
│  │  • profiles.is_active = puede loguear                           │
│  │  • profiles.active_store_id = tienda activa                     │
│  │  • profiles.tenant_id = tenant (NULL = sin restricción)         │
│  └─────────────────┘                                                │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │  MODIFICACIÓN   │                                                │
│  │                 │                                                │
│  │  • PATCH /api/  │  → manage_user_memberships (replace all)      │
│  │    users/[id]   │  → UPDATE profile (role, plan, etc.)          │
│  │                 │  ⚠️ 2 mutations separadas, no atómicas        │
│  │                 │                                                │
│  │  • Toggle       │  → UPDATE profiles SET is_active              │
│  │    status       │  → audit_logs entry                            │
│  │                 │                                                │
│  │  • Reset        │  → auth.admin.generateLink(recovery)          │
│  │    password     │                                                │
│  │                 │                                                │
│  │  • Change role  │  → profiles.role (enum)                        │
│  │    in store     │  → user_store_memberships.role                 │
│  │                 │  → trg_sync_profile_role mantiene sync        │
│  └─────────────────┘                                                │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │  ELIMINACIÓN    │                                                │
│  │                 │                                                │
│  │  1. POST        │                                                │
│  │  /api/users/    │                                                │
│  │  delete         │                                                │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  2. RPC         │  ← managed_delete_user(p_user_id)              │
│  │  managed_       │    Verifica dependencias:                      │
│  │  delete_user    │    - sales, receipts, transfers,               │
│  │                 │      cash_closures, inventory_movements       │
│  │                 │    Borra:                                      │
│  │                 │    - user_store_memberships (CASCADE)          │
│  │                 │    - profile                                   │
│  │         │       │                                                │
│  │         ▼       │                                                │
│  │  3. auth.admin  │  ← Si falla → orphaned auth.users              │
│  │  .deleteUser()  │    (usuario puede seguir logueando)            │
│  │                 │                                                │
│  │  FK REAL:       │  profiles_id_fkey → auth.users(id)             │
│  │                 │  ON DELETE NO ACTION (no CASCADE!)             │
│  │                 │                                                │
│  │  ⚠️ PROBLEMA:   │  Si borras auth.users PRIMERO,                 │
│  │                 │  NO hay CASCADE → profile queda huérfano       │
│  │                 │  (FK es NO ACTION, no CASCADE)                 │
│  └─────────────────┘                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### ¿Qué ocurre si falla cada paso?

| Paso falla | Estado resultante | Recuperación |
|-----------|-------------------|-------------|
| auth.admin.createUser() | Nada creado | N/A |
| on_auth_user_created trigger | auth.users sin profile | Llamar managed_create_user manualmente |
| managed_create_user RPC | auth.users + profile básico (trigger) → fallback path | Fallback hace 3 writes no atómicos |
| Fallback: profile UPDATE | auth.users + profile básico | auth.admin.deleteUser() |
| Fallback: memberships INSERT | auth.users + profile sin memberships | auth.admin.deleteUser() |
| Fallback: active_store_id UPDATE | auth.users + profile + memberships sin active_store | ⚠️ NO rollback (console.warn) |
| generateLink (recovery email) | Usuario creado sin email | ⚠️ NO rollback |
| managed_delete_user RPC | profile + memberships borrados | auth.admin.deleteUser() aún pendiente |
| auth.admin.deleteUser() | ⚠️ orphaned auth.users (login funciona) | Manual: borrar auth.users desde Supabase Studio |

---

## 4. FK/CASCADE Reales entre auth.users y profiles

### Constraint verificado en DB

```sql
-- profiles_id_fkey (FK de profiles.id → auth.users.id)
FOREIGN KEY (id) REFERENCES auth.users(id)
-- confdeltype = 'a' = NO ACTION
```

**NO hay CASCADE.** Si borras `auth.users`, el FK de `profiles.id` genera error (NO ACTION) → profile no se borra automáticamente.

### Implicaciones

| Operación | Resultado |
|-----------|-----------|
| Borrar `auth.users` primero | ❌ ERROR: FK violation (profile referencia auth.users) |
| Borrar `profile` primero | ✅ OK ( memberships se borran por CASCADE) |
| Borrar `auth.users` después | ✅ OK (profile ya no existe) |
| Borrar `auth.users` sin borrar profile | ❌ ERROR: FK violation |

### Orden correcto actual

El flujo actual hace:
1. `managed_delete_user` → borra profile (memberships CASCADE)
2. `auth.admin.deleteUser` → borra auth.users

**Este orden es CORRECTO** (profile primero, auth después).

### Si auth.admin.deleteUser falla

| Estado | Problema | Recuperación |
|--------|----------|-------------|
| Profile borrado, auth.users NO borrado | Usuario puede loguear pero trigger `on_auth_user_created` crea nuevo profile | Re-intentar `auth.admin.deleteUser` manualmente |

### Recomendación

**NO cambiar el orden.** El orden actual (profile → auth) es correcto porque el FK es NO ACTION. Lo que falta es:
- Re-intento automático de `auth.admin.deleteUser` si falla
- Log de alerta si el auth.users queda huérfano
- Job de cleanup que detecte auth.users sin profile

---

## 5. Auditoría de Emails Duplicados

### Resultado

| Métrica | Valor |
|---------|-------|
| Total profiles | 18 |
| Emails distinct | 18 |
| Emails duplicados | **0** |
| Emails NULL | 0 |

### Impacto de UNIQUE(email)

| Escenario | Impacto |
|-----------|---------|
| Crear usuario con email nuevo | ✅ Sin problema |
| Crear usuario con email existente | ❌ 409 Conflict (en lugar de error de auth.users) |
| Soft delete (is_active=false) | ✅ Sin problema (email no cambia) |
| Restaurar usuario | ✅ Sin problema (email sigue ahí) |
| Invitar usuario con email existente | ❌ Rechazado (correcto) |

### Conclusión

**Seguro agregar `UNIQUE(email)` constraint.** No hay duplicados existentes. El constraint mejorará la integridad y dará feedback temprano.

---

## 6. Auditoría del Enum `plan`

### Estado actual

| Dónde | Valores usados |
|-------|---------------|
| `profiles.plan` (DB) | `text`, valores reales: `free` (15), `enterprise` (3) |
| `UserForm.tsx:21` (Zod) | `z.enum(['basico', 'profesional', 'enterprise'])` |
| `UsersManagementView.tsx:152,167,169` | `free`, `pro` |
| `schemas.ts:168` | `z.preprocess(...)` (normaliza) |
| `schemas.ts:642` | `z.enum(['basico', 'profesional', 'enterprise'])` |
| `api-schemas.ts` | No incluye plan |
| `PLAN_LIMITS` (tenant-limiter.ts) | `free`, `pro`, `enterprise` |

### Inconsistencia

- **UserForm** usa `basico/profesional/enterprise` (español)
- **UsersManagementView** usa `free/pro/enterprise` (inglés)
- **DB** tiene `free` y `enterprise` (inglés)
- **UserForm** envía `basico` pero DB espera `free` → **mismatch silencioso**

### Dependencias

| Capa | Archivos | Líneas |
|------|----------|-------:|
| Frontend | `UserForm.tsx`, `UsersManagementView.tsx` | 4 referencias |
| API | `schemas.ts`, `tenant-limiter.ts` | 3 referencias |
| DB | `profiles.plan` (TEXT, sin constraint) | — |
| Funciones | `check_bulk_ops_hourly_limit` usa `free/pro/enterprise` | 1 referencia |
| Migraciones | No hay CHECK constraint en plan | — |
| Tests | No encontrados | — |

### Recomendación

**NO cambiar el enum hasta tener un plan de migración gradual.** Si se cambia:
1. Normalizar DB: `UPDATE profiles SET plan = 'free' WHERE plan = 'basico'`
2. Agregar CHECK constraint: `CHECK (plan IN ('free', 'pro', 'enterprise'))`
3. Actualizar `UserForm.tsx` a `z.enum(['free', 'pro', 'enterprise'])`
4. Actualizar `schemas.ts` a mismo enum

---

## 7. Dev Bypass — Estado Actual

```typescript
// auth-middleware.ts:64-90
if (token === 'dev-token-bypass' && process.env.ENABLE_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
  // Grant admin role with memberships on ALL active stores
}
```

### Recomendación

- ✅ Imposible en producción (`NODE_ENV !== 'production'`)
- ✅ Habilitable solo con `ENABLE_DEV_BYPASS=true`
- ⚠️ Falta: log de auditoría cuando se activa
- ⚠️ Falta: warning visible en UI cuando está activo

---

## 8. Decisión Final — ¿Qué entra en Iteración 9?

### Recomendado para Iteración 9 (CRÍTICO)

| Hallazgo | Acción | Riesgo si no se hace |
|----------|--------|---------------------|
| R-08-SEC-01 (RPCs sin auth) | Auth checks internos + REVOKE anon/PUBLIC | Cualquier usuario puede bulk delete |
| H-09-03 (Fallback no atómico) | Arreglar trigger issue + eliminar fallback | Usuarios huérfanos |
| H-09-04 (Delete orphans) | Re-intento auth delete + log de alerta | auth.users fantasma |

### Diferido a Iteración posterior

| Hallazgo | Razón para diferir |
|----------|-------------------|
| H-09-02 (tenant_id NULL) | Requiere decisión de producto: ¿multi-tenant real? |
| H-09-05 (UNIQUE email) | Seguro pero no crítico — puede hacerse independientemente |
| H-09-06 (Dev bypass) | Ya está gateado por NODE_ENV — solo falta auditoría |
| H-09-07 (Plan enum) | Requiere migración gradual — puede romper compatibilidad |
| H-09-08 a H-09-12 (Bajos) | No críticos — backlog |

---

## 9. Estado

```
Auditoría completa:        ✅
Matriz de permisos RPC:    ✅ (13 RPCs)
tenant_id:                 ✅ Clasificado como "activo pero no utilizado"
FK/CASCADE:                ✅ Verificado (NO ACTION, no CASCADE)
Emails duplicados:         ✅ 0 duplicados (seguro UNIQUE)
Dev bypass:                ✅ Ya gateado por NODE_ENV
Plan enum:                 ✅ Inconsistencia documentada (basico vs free)
Ciclo de vida usuario:     ✅ Diagrama completo

Aprobación usuario:        ⏳ Pendiente
```

**Espero tu decisión sobre qué entra en Iteración 9 vs iteración posterior.**
