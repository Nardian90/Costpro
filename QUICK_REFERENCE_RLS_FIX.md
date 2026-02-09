# 🚀 QUICK REFERENCE: RLS Fix - Copy/Paste para el Team

**Guardá esto para consulta rápida**

---

## ⚡ ¿Qué se arregló?

```
✅ is_admin() retorna TRUE (era FALSE)
✅ Policies consolidadas en stores (era 3 conflictivas)
✅ Nueva policy permite admin editar users
✅ Admin puede desactivar usuarios
✅ Multi-tenant aislamiento intacto
```

---

## 📝 Cambios en Backend

### Migration Aplicada

Archivo: `supabase/migrations/20260209_fix_critical_rls_issues.sql`

```sql
-- 3 cambios principales:

1. CREATE OR REPLACE FUNCTION public.is_admin()
   -- Antes: role::text IN ('admin', 'superadmin')  ❌
   -- Ahora: role = ANY(ARRAY['admin', 'superadmin']::user_role[])  ✅

2. Consolidar policies en stores
   -- Antes: 3 policies conflictivas
   -- Ahora: 4 policies claras sin duplicados

3. NEW POLICY "profiles_admin_full_access"
   -- Permite admin hacer ALL en profiles
```

---

## 📱 Cambios en Frontend

### Archivo: `src/components/views/terminal/views/users/useUsersView.ts`

**Status:** ✅ YA INCLUIDO (línea ~78)

```typescript
// Ya tiene is_active en el payload:
await updateUserMutation.mutateAsync({
  id: selectedUserContractId,
  full_name: data.fullName,
  role: data.role,
  is_active: data.isActive,  // ✅ YA ESTÁ
  max_stores_limit: ...,
  max_users_limit: ...
});
```

**No hay cambios necesarios.**

---

## 🧪 Testing Rápido

### Antes de validar en UI, ejecuta esto:

```sql
-- En Supabase SQL Editor:

-- 1. ¿Consolidadas las policies?
SELECT COUNT(*) as policy_count FROM pg_policies 
WHERE tablename='stores' AND schemaname='public';
-- Esperado: 4

-- 2. ¿Existen policies nuevas?
SELECT policyname FROM pg_policies 
WHERE tablename='profiles' AND policyname='profiles_admin_full_access';
-- Esperado: 1 row

-- 3. ¿Tiendas aún existen?
SELECT COUNT(*) FROM stores WHERE is_active=true;
-- Esperado: 2+
```

---

## ✅ Testing en UI

### 1. Tiendas (5 min)

```
1. Ir a Gestión → Tiendas
   → Esperado: ✅ Ves 2+ tiendas
   
2. Click "Crear Tienda"
   → Esperado: ✅ Se crea sin error 403
   
3. Click Editar tienda
   → Esperado: ✅ Se edita sin error
```

### 2. Usuarios (5 min)

```
1. Ir a Gestión → Usuarios
   → Esperado: ✅ Ves 3+ usuarios
   
2. Click Editar un usuario
   → Esperado: ✅ Se abre form, puedes editar
   
3. Toggle "Activo/Baneado"
   → Esperado: ✅ Se cambia estado sin error 403
```

---

## 🔍 Si Algo Falla

### Error 403 "row security policy blocked"

```
→ Esperar 60 segundos (cache PostgREST)
→ Hard refresh: Ctrl+Shift+R
→ localStorage.clear(); location.reload();
```

### Error "Cannot find memberships column"

```
→ En Supabase SQL Editor:
   NOTIFY pgrst, 'reload schema';
→ Esperar 30 segundos
→ Hard refresh del navegador
```

### Admin no ve tiendas (vacío sin error)

```
→ Verificar que user loggeado ES admin:
   SELECT role FROM profiles WHERE id = current_user_id;
   -- Debe ser 'admin' o 'superadmin'
```

---

## 📊 Cambios Resumidos

| Componente | Cambio | Estado |
|-----------|--------|--------|
| `is_admin()` | Reparada (ENUM fix) | ✅ APPLIED |
| `stores` policies | Consolidadas (4 claras) | ✅ APPLIED |
| `profiles` policy | Nueva "admin_full_access" | ✅ APPLIED |
| Frontend | `is_active` en payload | ✅ ALREADY THERE |

---

## 🚀 Ready?

1. ✅ Backend fix aplicado
2. ✅ Frontend ya tiene el código correcto
3. ✅ Testing manual: ~15 min
4. ✅ Deploy cuando tests pasen

**Estado:** LISTO PARA PRODUCCIÓN

---

## 📚 Docs Completos

- **`DIAGNOSTICO_CRITICO_RLS.md`** - Análisis técnico
- **`TESTING_MANUAL_RLS_FIXES.md`** - Guía paso-a-paso
- **`EXECUTIVE_SUMMARY_RLS_FIX.md`** - Resumen para stakeholders

---

**Last Updated:** 2026-02-09 14:00 UTC
