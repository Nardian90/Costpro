# Iteración 9 — Auditoría del Modelo de Autorización

**Fecha:** 2026-08-02
**Iteración:** 9 — Managed Create User
**Fase:** Auditoría del modelo de autorización (sin modificar código)
**Pregunta:** ¿Existen dos sistemas de autorización en paralelo?

---

## 0. Respuesta Ejecutiva

**SÍ, existen TRES representaciones del rol operando en paralelo.** Pero no son tres sistemas independientes — son tres capas con propósitos distintos que se sincronizan parcialmente vía trigger. El problema real es que la sincronización es **unidireccional y con gaps**.

---

## 1. Las Tres Representaciones del Rol

### Representación 1: `profiles.role` (enum `user_role`)

| Aspecto | Valor |
|---------|-------|
| **Tipo** | `user_role` enum: `admin, encargado, clerk, warehouse, costo, manager, usuario` |
| **Propósito** | Rol GLOBAL del usuario (aplica a todas las tiendas) |
| **Quién lo lee** | `is_admin()`, `is_global_admin()`, `managed_create_user` (hierarchy check), frontend |
| **Quién lo escribe** | `managed_create_user` (INSERT/UPDATE), `on_auth_user_created` trigger, `fn_sync_profile_role` trigger (deriva de `role_id`) |
| **RLS que lo usan** | 32 policies usan `is_admin()` → indirectamente leen `profiles.role` |
| **Frontend** | `user?.role === 'admin'`, `user?.role === 'encargado'`, etc. (30+ referencias) |

### Representación 2: `profiles.role_id` (FK → `roles` table)

| Aspecto | Valor |
|---------|-------|
| **Tipo** | UUID, FK a `roles(id)` |
| **Propósito** | Referencia al rol en la tabla `roles` (normalización V2.8) |
| **Quién lo lee** | `can_create_user_with_role()` (via JOIN roles), `on_auth_user_created` (busca role_id) |
| **Quién lo escribe** | `managed_create_user` (INSERT), `on_auth_user_created` trigger |
| **RLS que lo usan** | 0 directa — pero `is_role_not_changed()` lo verifica en UPDATE |
| **Frontend** | `useRoles.ts` (count de uso), `useUsers.ts` (select column), tipos |
| **Source of truth?** | **Sí, según V2.8** — `role_id` es la fuente, `role` se deriva |

### Representación 3: `user_store_memberships.role` (enum `user_role`)

| Aspecto | Valor |
|---------|-------|
| **Tipo** | `user_role` enum (mismo enum que profiles.role) |
| **Propósito** | Rol del usuario EN UNA TIENDA ESPECÍFICA |
| **Quién lo lee** | `has_store_role()`, `is_store_manager()`, `has_store_access()` (implicit), frontend |
| **Quién lo escribe** | `managed_create_user` (INSERT memberships), `manage_user_memberships`, `bulk_assign_memberships` |
| **RLS que lo usan** | 16 policies usan `has_store_role()`, 97 usan `has_store_access()` |
| **Frontend** | `user?.memberships?.some(m => m.role === 'encargado')` (10+ referencias) |

---

## 2. ¿Cómo se Sincronizan?

### Trigger `fn_sync_profile_role` (BEFORE UPDATE on profiles)

```sql
-- Si role_id cambió, derivar role desde role_id
IF NEW.role_id IS NOT NULL AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
  SELECT public.role_name_to_enum(r.name) INTO v_role_enum
  FROM public.roles r WHERE r.id = NEW.role_id;
  NEW.role := v_role_enum::user_role;
END IF;
```

**Flujo:**
```
role_id cambia → trigger deriva role (enum) desde roles.name
```

**Dirección:** `role_id → role` (unidireccional)

### Gap de sincronización

| Escenario | ¿Se sincroniza? | Problema |
|-----------|:---:|----------|
| Cambiar `role_id` via SQL | ✅ Sí | `role` se actualiza |
| Cambiar `role` via SQL directo | ❌ NO | `role_id` NO se actualiza → desincronización |
| Cambiar `role` via API (UPDATE profiles) | ⚠️ Parcial | `is_role_not_changed()` verifica que no cambie, pero si cambia, `role_id` no se actualiza |
| `managed_create_user` hace UPSERT | ✅ Sí | Setea ambos `role` y `role_id` simultáneamente |
| `on_auth_user_created` trigger | ✅ Sí | Setea ambos |
| Cambiar membership role | ❌ NO afecta | `profiles.role` NO cambia (correcto — son sistemas distintos) |

### ¿Es un problema real?

**NO es un problema en la práctica** porque:

1. El único camino para cambiar `profiles.role` es via `managed_create_user` (que setea ambos) o via API con `is_role_not_changed()` guard
2. Nadie hace UPDATE directo a `profiles.role` en SQL (no hay ruta de aplicación que lo haga)
3. `role_id` y `role` siempre se setean juntos en los flujos de creación

**PERO es deuda técnica** porque:
- Si alguien hace UPDATE directo a `profiles.role` (ej: desde Supabase Studio), `role_id` queda desactualizado
- No hay trigger que sincronize en la dirección `role → role_id`

---

## 3. ¿Son Dos Sistemas de Autorización?

### NO — Son DOS DIMENSIONES de autorización

```
┌─────────────────────────────────────────────────────────┐
│              MODELO DE AUTORIZACIÓN                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  DIMENSIÓN 1: ROL GLOBAL (profiles.role / role_id)      │
│  ─────────────────────────────────────────────           │
│  • Define qué puede hacer el usuario GLOBALMENTE        │
│  • admin → ve todas las tiendas                         │
│  • encargado → puede crear usuarios (no admin)          │
│  • clerk/warehouse/costo → solo operaciones específicas │
│  • Consultado por: is_admin(), is_global_admin()        │
│  • Usado en: 32 RLS policies + frontend (30+ refs)     │
│                                                          │
│  DIMENSIÓN 2: ROL POR TIENDA (memberships.role)         │
│  ─────────────────────────────────────────────           │
│  • Define qué puede hacer el usuario EN UNA TIENDA      │
│  • admin/manager/encargado → puede gestionar esa tienda │
│  • clerk → POS en esa tienda                            │
│  • warehouse → inventario en esa tienda                 │
│  • Consultado por: has_store_role(), has_store_access() │
│  • Usado en: 113 RLS policies + frontend (10+ refs)    │
│                                                          │
│  COMBINACIÓN:                                            │
│  • Un usuario con role=encargado (global) Y             │
│    membership role=encargado en tienda A                 │
│    → puede gestionar tienda A                            │
│  • Un usuario con role=encargado (global) PERO          │
│    sin membership en tienda B                            │
│    → NO puede acceder a tienda B                         │
│                                                          │
│  EXCEPCIÓN:                                              │
│  • role=admin (global) → bypassa memberships            │
│    → puede acceder a TODAS las tiendas                   │
│    → esto es por diseño (admin interno de CostPro)      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Funciones de autorización — Mapa completo

| Función | Qué lee | Propósito | RLS que la usan |
|---------|---------|-----------|-----------------:|
| `is_admin()` | `profiles.role = 'admin'` | ¿Es admin global? | 32 |
| `is_global_admin()` | `profiles.role = 'admin'` | Idéntica a is_admin | 25 |
| `is_store_manager(store_id)` | `memberships.role IN ('encargado','manager')` | ¿Es manager de esta tienda? | (verificado en RLS) |
| `has_store_access(store_id)` | `memberships` + `profiles.tenant_id` + `is_admin()` | ¿Puede acceder a esta tienda? | 97 |
| `has_store_role(store_id, roles[])` | `memberships.role = ANY(roles)` | ¿Tiene uno de estos roles en la tienda? | 16 |
| `can_create_user_with_role(creator_id, role_name)` | `profiles.role_id` JOIN `roles` | ¿Puede crear un usuario con este rol? | (RPC interno) |
| `is_role_not_changed(user_id, new_role, new_role_id)` | `profiles.role` + `profiles.role_id` | ¿El rol cambió? (guard en UPDATE) | 1 (profiles UPDATE) |

### Frontend — Mapa de uso

| Dónde | Qué lee | Para qué |
|-------|---------|----------|
| `TerminalShell.tsx` | `user.role` + `user.memberships[].role` | Mostrar/ocultar vistas |
| `MobileTabBar.tsx` | `user.role` | Mostrar/ocultar tabs |
| `Sidebar.tsx` | `user.role` + `user.plan` | Mostrar badge de plan |
| `useStoresView.ts` | `user.role` + `user.memberships[].role` | ¿Es admin? ¿Es encargado? |
| `useUsersView.ts` | `user.role` + `user.memberships[].role` | ¿Puede crear usuarios? |
| `StoreTeamModal.tsx` | `member.role` (membership) | Cambiar rol en tienda |
| `UserForm.tsx` | `memberships[].role` | Asignar rol por tienda |
| `roles.ts` (canManageStore) | `user.role` + `user.memberships[].role` | Autorización canónica por tienda |
| `roles.ts` (hasRole) | `user.role` + `user.roles[]` + `user.memberships[].role` | Check de rol global o por tienda |

---

## 4. Inventario: Dónde se Lee y Escribe Cada Representación

### `profiles.role` (enum)

| Operación | Dónde | L/E |
|-----------|-------|:---:|
| `is_admin()` | DB function | L |
| `is_global_admin()` | DB function | L |
| `managed_create_user` | RPC | L+E |
| `on_auth_user_created` | Trigger | E |
| `fn_sync_profile_role` | Trigger | E (deriva de role_id) |
| `is_role_not_changed` | DB function | L |
| `can_create_user_with_role` | RPC (via JOIN) | L (indirecto) |
| Frontend: `user?.role === 'admin'` | 30+ archivos | L |
| API: `session.user.role` | auth-middleware.ts | L |
| `roles.ts: canManageStore` | Frontend | L |
| `roles.ts: hasRole` | Frontend | L |
| `roles.ts: getAllowedRoles` | Frontend | L |
| RLS: 32 policies via `is_admin()` | DB | L (indirecto) |
| RLS: 25 policies via `is_global_admin()` | DB | L (indirecto) |

### `profiles.role_id` (FK → roles)

| Operación | Dónde | L/E |
|-----------|-------|:---:|
| `managed_create_user` | RPC | L+E |
| `on_auth_user_created` | Trigger | E |
| `fn_sync_profile_role` | Trigger | L (source para derivar role) |
| `can_create_user_with_role` | RPC (JOIN roles) | L |
| `is_role_not_changed` | DB function | L |
| Frontend: `useRoles.ts` | Hook | L (count de uso) |
| Frontend: `useUsers.ts` | Hook | L (select column) |
| Frontend: `user-service.ts` | Service | L (select column) |
| Tipos: `types/index.ts` | TypeScript | L (type def) |
| RLS: 0 directa | — | — |

### `user_store_memberships.role` (enum)

| Operación | Dónde | L/E |
|-----------|-------|:---:|
| `has_store_role()` | DB function | L |
| `is_store_manager()` | DB function | L |
| `has_store_access()` | DB function (implicit) | L |
| `managed_create_user` | RPC | E |
| `manage_user_memberships` | RPC | E |
| `bulk_assign_memberships` | RPC | E |
| Frontend: `user.memberships[].role` | 10+ archivos | L |
| Frontend: `canManageStore` | roles.ts | L |
| Frontend: `hasRole` | roles.ts | L |
| Frontend: `StoreTeamModal` | Component | L+E (inline change) |
| Frontend: `UserForm` | Component | E (form field) |
| RLS: 16 policies via `has_store_role()` | DB | L (indirecto) |
| RLS: 97 policies via `has_store_access()` | DB | L (indirecto) |

---

## 5. Hallazgos

### H-09-AUTH-01 (Medio): `is_admin()` y `is_global_admin()` son idénticas

**Descripción:**
Ambas funciones hacen exactamente lo mismo:
```sql
SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

**Impacto:**
- 32 RLS policies usan `is_admin()`
- 25 RLS policies usan `is_global_admin()`
- Mantener dos funciones idénticas es confuso y deuda técnica

**Recomendación:**
Consolidar en una sola (ej: mantener `is_admin()`, deprecar `is_global_admin()`).

### H-09-AUTH-02 (Medio): Sincronización `role ↔ role_id` es unidireccional

**Descripción:**
El trigger `fn_sync_profile_role` solo sincroniza `role_id → role`. Si alguien cambia `role` directamente, `role_id` no se actualiza.

**Impacto:**
- Bajo en práctica (nadie hace UPDATE directo a `profiles.role`)
- Pero si sucede (Supabase Studio, debugging), queda desincronizado

**Recomendación:**
Agregar sincronización bidireccional o restringir UPDATEs a solo via RPC.

### H-09-AUTH-03 (Bajo): `manager` como global role es inconsistente

**Descripción:**
- `roles.ts` documenta: `'manager' es un rol de MEMBERSHIP, no global`
- Pero el enum `user_role` incluye `manager`
- Y el frontend hace `user?.role === 'manager'` en varios lugares

**Impacto:**
- Si un profile tuviera `role = 'manager'`, el frontend lo trataría como encargado
- Pero `is_admin()` no lo reconoce como admin
- Comportamiento indefinido

**Recomendación:**
Documentar claramente que `manager` solo es válido en `memberships.role`, no en `profiles.role`.

### H-09-AUTH-04 (Bajo): Frontend usa ambos sistemas en paralelo

**Descripción:**
El frontend hace checks como:
```typescript
const isEncargado = user?.role === 'encargado' || user?.role === 'manager'
  || user?.memberships?.some(m => m.role === 'encargado');
```

Esto mezcla rol global (`user.role`) con rol de membership (`m.role`) en una sola expresión.

**Impacto:**
- No es un bug — es intencional (un encargado global O un encargado de alguna tienda)
- Pero hace difícil razonar sobre permisos

**Recomendación:**
Estandarizar usando `hasRole()` de `roles.ts` que ya maneja ambos casos.

---

## 6. Conclusión

### ¿Existen dos sistemas de autorización en paralelo?

**NO.** Existen **dos dimensiones** de autorización que operan en conjunto:

1. **Rol global** (`profiles.role` / `role_id`) — qué puede hacer el usuario en general
2. **Rol por tienda** (`memberships.role`) — qué puede hacer en una tienda específica

Estas dos dimensiones son **correctas por diseño** y no deben unificarse. Un usuario puede ser `costo` globalmente pero tener `admin` de membership en una tienda específica.

### ¿Es un problema antes de seguir creando usuarios?

**NO bloqueante.** El modelo actual funciona correctamente porque:
- Los flujos de creación (`managed_create_user`, `on_auth_user_created`) setean ambos campos
- El trigger `fn_sync_profile_role` mantiene sincronía `role_id → role`
- Las RLS policies usan las funciones correctas para cada dimensión
- El frontend usa `canManageStore()` que combina ambas dimensiones correctamente

### Deuda técnica a resolver (no bloquea Iteración 9)

1. Consolidar `is_admin()` y `is_global_admin()` (H-09-AUTH-01)
2. Sincronización bidireccional `role ↔ role_id` (H-09-AUTH-02)
3. Documentar que `manager` no es global role válido (H-09-AUTH-03)
4. Estandarizar frontend con `hasRole()` (H-09-AUTH-04)

---

## 7. Estado

```
Auditoría modelo de autorización:  ✅ Completa
¿Dos sistemas en paralelo?         NO — dos dimensiones correctas por diseño
¿Bloquea Iteración 9?              NO
Deuda técnica identificada:        4 hallazgos (2 Medios, 2 Bajos)
```

**El modelo de autorización es sólido.** Las dos dimensiones (global + por-tienda) son correctas y están bien separadas. La deuda técnica (funciones duplicadas, sincronización unidireccional) puede resolverse en una iteración posterior sin bloquear el hardening de RPCs y la eliminación del fallback path.
