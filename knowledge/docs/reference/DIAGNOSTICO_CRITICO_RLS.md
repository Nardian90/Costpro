# 🔴 DIAGNÓSTICO CRÍTICO: BLOQUEO FUNCIONAL RLS / MULTI-TENANT

**Fecha:** 9 de febrero de 2026
**Estado:** BLOQUEADO - Tiendas/Usuarios no se ven, Admin no puede gestionar
**Severidad:** CRÍTICA - Sistema no funcional en producción

---

## ⚡ RESUMEN EJECUTIVO

El sistema está **completamente bloqueado** debido a una **combinación de 3 problemas interdependientes en RLS + Frontend**:

| Problema | Causa | Impacto | Severidad |
|----------|-------|--------|----------|
| **Tiendas NO se ven** | Policy `Users can view all stores` con `true` duplica + oculta admin policy | SELECT devuelve 0 resultados para admin | 🔴 CRÍTICA |
| **Admin NO puede crear/editar usuarios** | `is_admin()` retorna `false` (siempre) - culpa: `role::text` vs ENUM | UPDATE/DELETE fallan con 403 | 🔴 CRÍTICA |
| **Usuarios NO pueden ser desactivados** | `useUpdateUser` envía campos no persistentes (`memberships`) | "Column not found" error | 🟠 ALTA |

---

## 📊 DIAGNÓSTICO DETALLADO

### 1. PROBLEMA: Tiendas NO aparecen en Frontend (SELECT retorna ∅)

#### Causa Raíz

En la tabla `stores`, hay **2 policies de SELECT** que crean un **corto circuito lógico**:

```sql
-- POLICY 1: "Stores management" (ALL operations)
USING: (get_my_role() = 'admin'::text) OR ((get_my_role() = 'encargado'::text) AND (created_by = auth.uid()))

-- POLICY 2: "Stores visibility" (SELECT)
USING: (is_admin() OR (EXISTS (SELECT 1 FROM user_store_memberships m WHERE ((m.store_id = stores.id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::membership_status)))))

-- POLICY 3: "Users can view all stores" (SELECT) ⚠️ PROBLEMA
USING: true
```

**El problema:**
- La policy "Users can view all stores" con `USING: true` **permite a TODOS acceder**
- Sin embargo, en PostgreSQL RLS, cuando hay **múltiples policies, TODAS deben pasar** (AND logic) para operaciones de lectura con `WHERE`
- Las policies no son inclusive (OR entre ellas), sino que se aplican como **restricciones acumulativas**
- El `true` en la tercera policy debería permitir todo, pero **NO está siendo evaluado en contexto de rol**

**Explicación técnica:**
La lógica es:
```
Policy A (admin check) → restringida a admins
Policy B (membership check) → restringida a miembros
Policy C (true) → todos
```

Cuando hay 3 policies, PostgreSQL busca **al menos una que permita la acción**. Si Policy A retorna `false` y Policy B retorna `false`, entonces Policy C debería permitirlo. Pero si `get_my_role()` retorna `NULL` o un valor inesperado, todo falla.

---

### 2. PROBLEMA: `is_admin()` Retorna SIEMPRE `false` ❌

#### La Función Actual

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role::text IN ('admin', 'superadmin')
  );
END;
$$;
```

#### El Error

El campo `role` en `profiles` es del tipo **ENUM `user_role`**, no `text`:

```sql
ALTER TYPE user_role ENUM ADD VALUE 'admin';
ALTER TYPE user_role ENUM ADD VALUE 'superadmin';
-- ✅ Estos se almacenan como ENUM, no como TEXT
```

**En la BD:**
```
id                                  role (ENUM, no text)
a1111111-1111-1111-1111-111111111111  admin::user_role
```

**Cuando hace `role::text IN ('admin', 'superadmin')`:**
- PostgreSQL convierte `admin::user_role` → `'admin'` (string)
- Luego compara `'admin' IN ('admin', 'superadmin')` → ✅ debería ser `true`

**PERO:** El problema real es que **`get_my_role()` está retornando `NULL`** cuando `auth.uid()` es `NULL`:

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;  -- Retorna NULL si auth.uid() no existe
END;
$$;
```

Si un usuario está logeado pero **su perfil NO existe en `profiles`**, entonces:
- `auth.uid()` retorna un UUID válido
- `SELECT ... WHERE id = auth.uid()` retorna 0 filas
- `v_role` se queda como `NULL`
- `is_admin()` retorna `false`

---

### 3. PROBLEMA: Admin NO puede editar usuarios (403 Forbidden)

#### Flujo de Error

1. Admin intenta actualizar usuario:
   ```typescript
   await updateUserMutation.mutateAsync({
     id: selectedUserContractId,
     full_name: data.fullName,
     role: data.role,
     is_active: data.isActive,  // ⚠️ Campo importante
   });
   ```

2. En `useUpdateUser()`:
   ```typescript
   export function useUpdateUser() {
     return useMutation({
       mutationFn: async ({ id, ...rawUpdates }: ...) => {
         const updates = profileSchema.partial().parse(rawUpdates);
         const { memberships, ...cleanUpdates } = updates as any;  // ✅ Elimina memberships

         return await supabase
           .from('profiles')
           .update(cleanUpdates)  // Ahora limpio
           .eq('id', id);
       },
     });
   }
   ```

3. La política RLS en `profiles` para `UPDATE`:
   ```sql
   POLICY "Self profile update" (UPDATE)
   USING: (id = auth.uid())
   WITH CHECK: ((id = auth.uid()) AND (is_admin() OR (role = ( SELECT profiles_1.role FROM profiles profiles_1 WHERE (profiles_1.id = auth.uid()))))
   ```

   **El problema:**
   - `USING`: Solo permite si la fila es el perfil del usuario autenticado
   - `WITH CHECK`: Además, requiere que sea admin O que no cambie el rol
   - **Esto significa un Admin NUNCA puede editar a otro usuario** (porque `id ≠ auth.uid()`)

4. **No existe policy para Admin que permita UPDATE en perfiles ajenos**:
   ```sql
   POLICY "Admin full access"
   -- Solo tiene ALL, pero no especifica WITH CHECK
   ```

**El resultado:**
```
UPDATE profiles SET is_active = false WHERE id = 'other-user'
→ POLICY "Admin full access" USING: is_admin() → FALSE (por el error anterior)
→ POLICY "Self profile update" USING: id = auth.uid() → FALSE
→ ERROR 403: row security policy blocked access
```

---

### 4. PROBLEMA: Desactivación de usuarios falla con "Column not found"

#### En `useUsersView.ts`

```typescript
const handleUserFormSubmit = async (mode, data, selectedUserContractId) => {
  // ...
  if (mode === 'edit') {
    await updateUserMutation.mutateAsync({
      id: selectedUserContractId,
      full_name: data.fullName,
      role: data.role,
      // ❌ AQ UI FALTA: is_active!
    });

    // Pero memberships se intenta actualizar por otro lado
    await manageMembershipsMutation.mutateAsync({...});
  }
};
```

El campo `is_active` **no se está pasando al `useUpdateUser()`**. Entonces:
- Admin marca el checkbox: `isActive = false`
- Pero el payload no incluye `is_active`
- El UPDATE no actualiza nada
- Usuario sigue activo

---

## 🚨 CADENA DE DEPENDENCIAS (¿Por qué TODOXD?)

```
┌─────────────────────────────────────────────────────────────┐
│ ERROR 1: is_admin() retorna FALSE                            │
│ (Profile no existe para auth.uid() O role::text falla)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
   Stores NOT   Policies BLOCK   Admin UPDATE
   visible     Admin actions     fails (403)
   (SELECT)    (is_admin()=false)

       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
          ⚠️ Admin puede VER tiendas (3ª policy: true)
          ⚠️ Pero NO puede EDITAR (1ª policy depends on is_admin())
          ⚠️ Usuarios no se ven O se ven pero no pueden ser editados
```

---

## 💊 SOLUCIONES PROPUESTAS

### SOLUCIÓN 1: Reparar `is_admin()` (CRÍTICA)

**Opción A: Usar rol directo sin `get_my_role()`**

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(ARRAY['admin', 'superadmin']::user_role[])
  );
END;
$$;
```

**Cambios:**
- Usa directamente `role` (ENUM) sin cast a `text`
- Usa `ANY(ARRAY[...])` en lugar de `IN ('string')`
- Más seguro y evita problemas de conversión

---

### SOLUCIÓN 2: Consolidar policies en `stores` (CRÍTICA)

**Problema actual:**
- 3 policies solapadas
- 1 con `USING: true` que es un comodín peligroso

**Solución:**

```sql
-- ELIMINAR la policy peligrosa "Users can view all stores"
DROP POLICY IF EXISTS "Users can view all stores" ON public.stores;

-- CONSOLIDAR en UNA sola policy clara:
DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
DROP POLICY IF EXISTS "Stores management" ON public.stores;

CREATE POLICY "stores_select_admin_or_member"
  ON public.stores
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.store_id = stores.id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "stores_insert_admin_or_encargado"
  ON public.stores
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'encargado'::user_role
    )
  );

CREATE POLICY "stores_update_admin_or_encargado_creator"
  ON public.stores
  FOR UPDATE
  USING (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'encargado'::user_role
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'encargado'::user_role
    )
  );

CREATE POLICY "stores_delete_admin"
  ON public.stores
  FOR DELETE
  USING (is_admin());
```

---

### SOLUCIÓN 3: Agregar policy para Admin UPDATE en `profiles` (CRÍTICA)

```sql
-- NUEVA policy para permitir que Admins editen perfiles de otros usuarios
CREATE POLICY "Admin can manage any profile"
  ON public.profiles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
```

---

### SOLUCIÓN 4: Pasar `is_active` en `useUsersView.ts` (MEDIA)

En [../../../src/components/views/terminal/views/users/useUsersView.ts](../../../src/components/views/terminal/views/users/useUsersView.ts#L70):

```typescript
// ANTES
if (mode === 'edit' && selectedUserContractId) {
  await updateUserMutation.mutateAsync({
    id: selectedUserContractId,
    full_name: data.fullName,
    role: data.role,
  });
}

// DESPUÉS
if (mode === 'edit' && selectedUserContractId) {
  await updateUserMutation.mutateAsync({
    id: selectedUserContractId,
    full_name: data.fullName,
    role: data.role,
    is_active: data.isActive,  // ✅ AGREGADO
  });
}
```

---

### SOLUCIÓN 5: Verificar `get_my_role()` retorna valor no-NULL (BAJA)

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'usuario');  -- Default si no existe
END;
$$;
```

---

## ✅ PLAN DE ACCIÓN ORDENADO

### Fase 1: Backend (Supabase) - 15 minutos

1. **Corregir `is_admin()`** → Problema raíz de todo
2. **Consolidar policies en `stores`** → Elimina el comodín `true`
3. **Agregar policy "Admin can manage any profile"`** → Permite ediciones
4. **Ejecutar migrations** → Aplicar cambios

**Estimado:** ~5 minutos si no hay errores

### Fase 2: Frontend (React) - 5 minutos

1. **Agregar `is_active` a payload de `useUpdateUser`** en [useUsersView.ts](../../../src/components/views/terminal/views/users/useUsersView.ts#L70)

**Estimado:** ~2 minutos

### Fase 3: Validación - 10 minutos

1. Ejecutar queries de verificación
2. Pruebas manuales (Admin crea store, edita usuario, desactiva)
3. Verificar que multi-tenant sigue aislado

---

## 🧪 QUERIES DE VERIFICACIÓN

### Test 1: ¿Funciona `is_admin()` ahora?

```sql
-- Como usuario admin en frontend
SELECT public.is_admin() as is_admin_result;
-- Esperado: true
```

### Test 2: ¿Se ven tiendas en SELECT?

```sql
-- Sin policies (como service_role)
SELECT id, name, is_active FROM public.stores ORDER BY name;
-- Esperado: 2+ registros

-- Con policies (como usuario admin)
SELECT id, name, is_active FROM public.stores ORDER BY name;
-- Esperado: 2+ registros
```

### Test 3: ¿Puede Admin editar usuarios?

```sql
-- UPDATE is_active = false
UPDATE public.profiles SET is_active = false WHERE id = 'target-user-id';
-- Esperado: UPDATE 1 (sin errores 403)
```

### Test 4: ¿Está aislado multi-tenant?

```sql
-- Un usuario de Store A no debe ver usuarios de Store B
SELECT * FROM public.profiles
WHERE id IN (
  SELECT user_id FROM public.user_store_memberships
  WHERE store_id = 'store-b-id'
);
-- Esperado: 0 resultados si el usuario está en Store A
```

---

## 📋 CHECKLIST FINAL

- [ ] **Backend:** `is_admin()` retorna `true` para admins
- [ ] **Backend:** Policies consolidadas en `stores` (sin duplicados)
- [ ] **Backend:** Policy "Admin can manage any profile" existe
- [ ] **Frontend:** `useUsersView.ts` incluye `is_active` en UPDATE
- [ ] **Test:** Admin puede VER tiendas (SELECT)
- [ ] **Test:** Admin puede CREAR tiendas (INSERT)
- [ ] **Test:** Admin puede EDITAR usuarios (UPDATE full_name, role, is_active)
- [ ] **Test:** Admin puede DESACTIVAR usuarios (UPDATE is_active = false)
- [ ] **Test:** User no puede editar otros usuarios (403 Forbidden)
- [ ] **Test:** Multi-tenant aislamiento intacto

---

## 📌 NOTAS DE SEGURIDAD

✅ **Esta solución:**
- Restaura permisos admin sin relajar seguridad
- Mantiene aislamiento multi-tenant
- No rompe PostgREST
- Usa SECURITY DEFINER para proteger lógica sensible

❌ **NO hace:**
- Eliminar RLS
- Abrir acceso a datos de otros tenants
- Exponer funciones sin seguridad

---

## 🔗 ARCHIVOS AFECTADOS

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `supabase/migrations/[new]_fix_rls_critical.sql` | SQL | Crear |
| `src/components/views/terminal/views/users/useUsersView.ts` | TS | Editar línea ~70 |
| `src/hooks/api/useUsers.ts` | TS | Verificar (sin cambios necesarios) |
