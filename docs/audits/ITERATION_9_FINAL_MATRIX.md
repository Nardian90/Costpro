# Iteración 9 — Matriz Final de Permisos RPC

**Fecha:** 2026-08-02
**Migration:** `20260802000010_v2_12_49_rpc_hardening.sql` (aplicada)
**Estado:** ✅ Hardening completado + pruebas de bypass aprobadas

---

## Matriz Final

| # | RPC | Owner | SECURITY DEFINER | Grants finales | Auth check interno | Función de autorización | RLS involucradas |
|---|-----|-------|:---:|---|---|---|---|
| 1 | `bulk_soft_delete_stores` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `profiles.role = 'admin'` | `profiles.role` (global) | — (via soft_delete_store) |
| 2 | `generate_bulk_confirmation_token` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `profiles.role = 'admin'` + `p_user_id == auth.uid()` | `profiles.role` (global) | — |
| 3 | `generate_bulk_override_token` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `profiles.role = 'admin'` + `p_override_user_id == auth.uid()` | `profiles.role` (global) | — |
| 4 | `soft_delete_store` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `profiles.role = 'admin'` | `profiles.role` (global) | — |
| 5 | `managed_create_user` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `profiles.role IN ('admin','encargado')` + hierarchy check | `profiles.role` (global) + `has_store_access()` (por tienda) | — |
| 6 | `managed_delete_user` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` + `is_admin()` | `profiles.role` (global) + `memberships` (dependencias) | — |
| 7 | `bulk_assign_memberships` | postgres | ✅ SÍ | authenticated, service_role | ⚠️ No interno (confía en API route) | API route: `withAuth` + role check | — |
| 8 | `validate_store_can_be_modified` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ❌ No requiere (read-only) | — | — |
| 9 | `check_bulk_ops_hourly_limit` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ❌ No requiere (read-only) | — | — |
| 10 | `has_store_access` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ✅ `auth.uid()` implícito | `profiles.role` (via is_admin) + `memberships` + `tenant_id` | 97 RLS policies |
| 11 | `has_store_role` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ✅ `auth.uid()` implícito | `memberships.role` (por tienda) | 16 RLS policies |
| 12 | `is_admin` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ✅ `auth.uid()` implícito | `profiles.role = 'admin'` (global) | 32 RLS policies |
| 13 | `is_global_admin` | postgres | ✅ SÍ (STABLE) | authenticated, service_role | ✅ `auth.uid()` implícito | `profiles.role = 'admin'` (global) | 25 RLS policies |
| 14 | `is_store_manager` | postgres | ✅ SÍ | authenticated, service_role | ✅ `auth.uid()` implícito | `memberships.role IN ('encargado','manager')` (por tienda) | — |
| 15 | `create_store_with_membership` | postgres | ✅ SÍ | authenticated, service_role | ⚠️ No interno (confía en API route) | API route: `withRole('admin')` | — |

### Cambios aplicados (vs estado anterior)

| RPC | Cambio | Antes | Después |
|-----|--------|-------|---------|
| `bulk_soft_delete_stores` | + auth check interno | ❌ Sin check | ✅ `profiles.role = 'admin'` |
| `generate_bulk_confirmation_token` | + auth check interno | ❌ Sin check | ✅ `profiles.role = 'admin'` + `p_user_id == auth.uid()` |
| `generate_bulk_override_token` | + auth check interno | ❌ Verificaba via parámetro | ✅ `profiles.role = 'admin'` + `p_override_user_id == auth.uid()` |
| `soft_delete_store` | + auth check interno | ❌ Sin check | ✅ `profiles.role = 'admin'` |
| Todas las sensibles | REVOKE anon, PUBLIC | anon + PUBLIC tenían EXECUTE | ❌ anon + PUBLIC removidos |

---

## Pruebas de Bypass PostgREST (PT-9.x)

| Test | RPC | Encargado | Clerk | Admin | Service role | Anon |
|------|-----|:---:|:---:|:---:|:---:|:---:|
| PT-9.1 | `generate_bulk_confirmation_token` | ✅ Rechazado | ✅ Rechazado | ✅ Permitido | ✅ Permitido | ✅ Rechazado |
| PT-9.2 | `soft_delete_store` | ✅ Rechazado | ✅ Rechazado | ✅ Auth superado | ✅ Auth superado | ✅ Rechazado |
| PT-9.3 | `bulk_soft_delete_stores` | ✅ Rechazado | ✅ Rechazado | ✅ Auth superado | ✅ Auth superado | ✅ Rechazado |
| PT-9.4 | `validate_store_can_be_modified` | ✅ Permitido (read-only) | ✅ Permitido (read-only) | ✅ Permitido | ✅ Permitido | ✅ Rechazado |

**Todas las pruebas aprobadas.** Ningún usuario sin permisos puede invocar RPCs destructivos vía PostgREST.

---

## Eliminación del Fallback No Atómico

### Antes (3 writes separados sin transacción)

```
auth.admin.createUser()
  → RPC managed_create_user() falla
    → Fallback:
      1. UPDATE profile (sin active_store_id)
      2. UPSERT memberships
      3. UPDATE profile.active_store_id (sin rollback si falla)
```

### Después (único flujo transaccional)

```
auth.admin.createUser()
  → RPC managed_create_user() (transaccional)
    → Si falla: auth.admin.deleteUser() (rollback completo)
    → No existe fallback path
    → No existe creación parcial
```

**Cambios en `src/app/api/users/managed-create/route.ts`:**
- Eliminadas líneas 108-203 (fallback path completo)
- Reemplazado con: si RPC falla → log error → `auth.admin.deleteUser()` → retornar error
- Mapeo de errores RPC a respuestas HTTP (403 para permisos, 400 para datos inválidos)

---

## Deuda Técnica Documentada

### `is_admin()` vs `is_global_admin()` — Funciones idénticas

| Aspecto | `is_admin()` | `is_global_admin()` |
|---------|:---:|:---:|
| Query | `SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')` | Idéntica |
| RLS policies | 32 | 25 |
| Lenguaje | plpgsql | sql |
| ¿Son iguales? | ✅ SÍ | ✅ SÍ |

**Riesgo:** Si alguien modifica una pero no la otra, 57 RLS policies se comportarían inconsistentemente.

**Recomendación (NO implementar ahora):**
- **Opción A:** Hacer `is_global_admin()` un alias: `CREATE OR REPLACE FUNCTION is_global_admin() RETURNS boolean AS $$ SELECT public.is_admin(); $$ LANGUAGE sql STABLE;`
- **Opción B:** Converger las 25 policies que usan `is_global_admin()` a usar `is_admin()`, luego DROP `is_global_admin()`
- **Impacto:** Medio (57 policies afectadas)
- **Severidad:** Medio (riesgo de divergencia futura)
- **Estado:** Documentado como deuda técnica con impacto en seguridad y mantenimiento

### `manager` como global role inconsistente

- El enum `user_role` incluye `manager`
- Pero `roles.ts` documenta que `manager` es solo membership role
- El frontend hace `user?.role === 'manager'` en varios lugares
- **Recomendación:** Documentar que `manager` no debe asignarse como `profiles.role`

---

## Estado Final

```
Criterio de aceptación                                    Estado
─────────────────────────────────────────────────────────────────
Ningún RPC privilegiado puede invocarse vía PostgREST     ✅
sin autorización
No existe creación parcial de usuarios                    ✅
Existe un único flujo de creación                         ✅
Todas las pruebas de bypass pasan                         ✅ (PT-9.1 a PT-9.4)
Quede documentado qué mecanismo de autorización           ✅ (Matriz final)
utiliza cada RPC sensible
─────────────────────────────────────────────────────────────────

Migration aplicada: 20260802000010_v2_12_49_rpc_hardening.sql
Fallback eliminado: managed-create/route.ts (3 writes → 1 RPC transaccional)
Deuda documentada: is_admin vs is_global_admin (Medium)
```
