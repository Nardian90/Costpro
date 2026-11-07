# Iteración 9 — Inventario de Funciones de Autorización

**Fecha:** 2026-08-02
**Iteración:** 9 — Managed Create User
**Fase:** Auditoría obligatoria de funciones de autorización
**Estado:** Completo

---

## 1. Inventario Completo

### Funciones que toman decisiones de autorización (15)

| # | Función | Security Definer | ¿Qué consulta? | profiles.role | profiles.role_id | memberships | memberships.role | auth.uid() | Llama a otras auth functions | ¿Consistente con modelo? |
|---|---------|:-:|---|:-:|:-:|:-:|:-:|:-:|---|:-:|
| 1 | `is_admin()` | ✅ SÍ (STABLE) | `profiles WHERE id=auth.uid() AND role='admin'` | ✅ (implícito) | ❌ | ❌ | ❌ | ✅ | — | ✅ SÍ |
| 2 | `is_global_admin()` | ✅ SÍ (STABLE) | `profiles WHERE id=auth.uid() AND role='admin'` | ✅ (implícito) | ❌ | ❌ | ❌ | ✅ | — | ✅ SÍ (idéntica a #1) |
| 3 | `is_store_manager(p_store_id)` | ✅ SÍ | `memberships WHERE user_id=auth.uid() AND store_id=p_store_id AND role IN ('encargado','manager') AND status='active'` | ❌ | ❌ | ✅ | ✅ (implícito) | ✅ | — | ✅ SÍ |
| 4 | `has_store_access(p_store_id)` | ✅ SÍ (STABLE) | Llama `is_admin()` + `memberships JOIN stores JOIN profiles` (tenant_id check) | ✅ (via #1) | ❌ | ✅ | ✅ (status='active') | ✅ | `is_admin()` | ✅ SÍ |
| 5 | `has_store_role(p_store_id, p_roles[])` | ✅ SÍ (STABLE) | `memberships WHERE user_id=auth.uid() AND store_id=p_store_id AND status='active' AND role::text = ANY(p_roles)` | ❌ | ❌ | ✅ | ✅ (implícito) | ✅ | — | ✅ SÍ |
| 6 | `is_user_creator(p_target_user_id)` | ✅ SÍ | `profiles WHERE id=p_target_user_id AND created_by=auth.uid()` | ❌ | ❌ | ❌ | ❌ | ✅ | — | ✅ SÍ |
| 7 | `is_managed_user(p_target_user_id)` | ✅ SÍ | `memberships` del target cruzadas con `memberships` del caller (mismas tiendas, rol encargado/manager) | ❌ | ❌ | ✅ | ✅ (implícito) | ✅ | — | ✅ SÍ |
| 8 | `can_create_user_with_role(p_creator_id, p_role_name)` | ✅ SÍ | `profiles JOIN roles ON profiles.role_id = roles.id WHERE profiles.id = p_creator_id` | ❌ | ✅ | ❌ | ❌ | ❌ | — | ✅ SÍ |
| 9 | `is_role_not_changed(p_user_id, p_new_role, p_new_role_id)` | ✅ SÍ | `profiles WHERE id=p_user_id` → compara role y role_id actuales con nuevos | ✅ (implícito) | ✅ | ❌ | ❌ | ❌ | — | ✅ SÍ |
| 10 | `managed_create_user(...)` | ✅ SÍ | `profiles WHERE id=auth.uid()` → obtiene `role` del creator (hierarchy check) + `roles` table (role_id lookup) + `has_store_access()` para memberships | ✅ (implícito) | ✅ | ✅ | ❌ | ✅ | `has_store_access()` | ✅ SÍ |
| 11 | `managed_delete_user(p_user_id)` | ✅ SÍ | `memberships` del target + `is_admin()` para bypass | ✅ (via #1) | ❌ | ✅ | ❌ | ✅ | `is_admin()` | ✅ SÍ |
| 12 | `validate_active_store()` | ✅ SÍ | `memberships WHERE user_id=NEW.user_id AND store_id=NEW.active_store_id AND status='active'` | ❌ | ❌ | ✅ | ❌ (solo status) | ❌ (trigger) | — | ✅ SÍ |
| 13 | `on_auth_user_created()` | ✅ SÍ | `roles` table (busca role_id por nombre) + inserta profile | ❌ | ✅ | ❌ | ❌ | ❌ (trigger) | — | ✅ SÍ |
| 14 | `fn_sync_profile_role()` | ❌ NO | `roles` table (busca name por role_id) → deriva `profiles.role` | ❌ | ✅ | ❌ | ❌ | ❌ (trigger) | — | ✅ SÍ |
| 15 | `role_name_to_enum(p_name)` | ❌ NO | Mapping de nombre de rol a enum | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ SÍ (helper) |

### RPCs bulk que necesitan auth checks (Iteración 8 — pendiente)

| # | RPC | Security Definer | Auth check interno actual | Estado |
|---|-----|:-:|---|---|
| 16 | `bulk_soft_delete_stores(...)` | ✅ SÍ | ❌ NO | **CRÍTICO — necesita fix** |
| 17 | `generate_bulk_confirmation_token(...)` | ✅ SÍ | ❌ NO | **CRÍTICO — necesita fix** |
| 18 | `generate_bulk_override_token(...)` | ✅ SÍ | ❌ NO (verifica via parámetro, no auth.uid) | **CRÍTICO — necesita fix** |
| 19 | `soft_delete_store(...)` | ✅ SÍ | ❌ NO | **CRÍTICO — necesita fix** |

---

## 2. Análisis de Consistencia

### ¿Todas las funciones respetan la separación de dimensiones?

**SÍ.** Cada función consulta la dimensión correcta:

| Dimensión | Funciones que la usan | Propósito |
|-----------|----------------------|-----------|
| **Global** (profiles.role) | `is_admin()`, `is_global_admin()`, `managed_create_user` (hierarchy), `is_role_not_changed` | Decidir si el usuario es admin global o qué rol puede crear |
| **Por tienda** (memberships.role) | `is_store_manager()`, `has_store_role()`, `is_managed_user()`, `validate_active_store` | Decidir si el usuario tiene acceso a una tienda específica |
| **Ambas** (combinada) | `has_store_access()`, `managed_create_user`, `managed_delete_user` | Combinar admin global (bypass) + membership para acceso a tienda |
| **role_id** (roles table) | `can_create_user_with_role()`, `is_role_not_changed()`, `on_auth_user_created`, `fn_sync_profile_role` | Normalización V2.8 — role_id es source of truth, role es derivado |

### ¿Hay funciones inconsistentes?

**NO.** Todas las funciones usan la dimensión correcta para su propósito:

- Funciones que deciden acceso global → leen `profiles.role`
- Funciones que deciden acceso a tienda → leen `memberships.role`
- Funciones que combinan → usan `is_admin()` como bypass + `memberships` para scoped access

### ¿Hay divergencia entre `profiles.role` y `profiles.role_id`?

**NO en los flujos de aplicación.** Los únicos caminos para modificar profiles.role son:
1. `managed_create_user` — setea ambos simultáneamente
2. `on_auth_user_created` trigger — setea ambos
3. `fn_sync_profile_role` trigger — deriva `role` desde `role_id`

No existe ruta de aplicación que modifique `profiles.role` sin también modificar `role_id`.

---

## 3. Deuda Técnica: `is_admin()` vs `is_global_admin()`

### Estado actual

```sql
-- is_admin() — 32 RLS policies
SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')

-- is_global_admin() — 25 RLS policies
SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

**Son idénticas.** Misma query, mismo resultado, misma lógica.

### Riesgo de divergencia futura

Si alguien modifica `is_admin()` pero no `is_global_admin()` (o viceversa), 57 RLS policies se comportarían de manera inconsistente. Esto es un riesgo de seguridad y mantenimiento.

### Recomendación (NO implementar ahora — documentar como deuda)

**Opción A: Hacer `is_global_admin()` un alias**
```sql
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$ SELECT public.is_admin(); $$;
```
- Impacto: 25 RLS policies ahora llaman a `is_admin()` indirectamente
- Riesgo: mínimo (misma lógica)
- Beneficio: una sola función para mantener

**Opción B: Converger todas las policies a `is_admin()`**
```sql
-- Reemplazar is_global_admin() con is_admin() en 25 RLS policies
-- Luego DROP FUNCTION is_global_admin()
```
- Impacto: migration grande (25 policies)
- Riesgo: medio (tocar muchas policies)
- Beneficio: elimina la función duplicada

**Recomendación:** Opción A (alias) en una iteración futura. Es segura, reversible, y reduce el riesgo de divergencia.

### Documentación para future reference

| Deuda | Impacto | Severidad | Recomendación |
|-------|---------|-----------|---------------|
| `is_admin()` y `is_global_admin()` son idénticas | 57 RLS policies dependen de ambas | Medio | Opción A: hacer `is_global_admin()` un alias de `is_admin()` |

---

## 4. Conclusión

### Criterios de aceptación

| Criterio | Estado |
|----------|--------|
| Ningún RPC privilegiado puede invocarse directamente por PostgREST sin autorización | ⏳ Pendiente implementación (este documento es la base) |
| No existe creación parcial de usuarios | ⏳ Pendiente implementación |
| Existe un único flujo de creación | ⏳ Pendiente implementación |
| Todas las pruebas de bypass pasan | ⏳ Pendiente implementación |
| Quede documentado qué mecanismo de autorización utiliza cada RPC sensible | ✅ Este documento |

### El modelo es consistente

Las 15 funciones de autorización auditadas **respetan la separación de dimensiones**:
- Funciones globales leen `profiles.role`
- Funciones por-tienda leen `memberships.role`
- Funciones combinadas usan `is_admin()` como bypass + memberships para scoped access

**No se encontraron funciones inconsistentes.** La deuda técnica (`is_admin` duplicada) está documentada pero no bloquea la implementación.
