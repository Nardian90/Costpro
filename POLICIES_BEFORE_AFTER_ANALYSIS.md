# 📋 POLÍTICAS RLS - ANTES vs DESPUÉS (Referencia Técnica)

**Para:** Arquitectos, DevOps, Security Team  
**Tipo:** Comparación de cambios de seguridad

---

## 📊 TABLA 1: Policies en `stores` - ANTES vs DESPUÉS

### ANTES (❌ Problemático)

| Policy | Operación | USING Condition | WITH_CHECK | Problema |
|--------|-----------|-----------------|-----------|----------|
| "Stores management" | ALL | `get_my_role() = 'admin' OR (get_my_role() = 'encargado' AND created_by = auth.uid())` | NULL | ⚠️ No especifica WITH_CHECK para INSERT/UPDATE |
| "Stores visibility" | SELECT | `is_admin() OR EXISTS (memberships check)` | NULL | ✅ OK, pero redundante |
| "Users can view all stores" | SELECT | **`true`** | NULL | 🔴 PROBLEMA: Comodín que contradice otras |

**Problema Específico:**
- 3 policies para SELECT (redundancia)
- La tercera con `USING: true` es un comodín peligroso
- Si PostgREST no sabe cuál aplicar, puede usar la más permisiva
- Pero `is_admin()` retornaba FALSE, así que fallaba todo

---

### DESPUÉS (✅ Seguro)

| Policy | Operación | USING | WITH_CHECK | Propósito |
|--------|-----------|-------|-----------|----------|
| "stores_select_admin_or_member" | SELECT | `is_admin() OR EXISTS (membership)` | N/A | Admin O miembro activo |
| "stores_insert_admin_or_encargado" | INSERT | N/A | `is_admin() OR (created_by = auth.uid() AND encargado)` | Controla INSERT con precisión |
| "stores_update_admin_or_encargado_creator" | UPDATE | `is_admin() OR (creador encargado)` | Idem | Controla UPDATE con precisión |
| "stores_delete_admin" | DELETE | `is_admin()` | N/A | Solo admin puede borrar |

**Mejoras:**
- ✅ 4 políticas claras, una por operación
- ✅ Sin comodines (`true`)
- ✅ Separación de USING vs WITH_CHECK
- ✅ Cada role tiene su camino claro

---

## 📊 TABLA 2: Policies en `profiles` - ANTES vs DESPUÉS

### ANTES (❌ Admin bloqueado)

| Policy | Operación | USING | WITH_CHECK | Problema |
|--------|-----------|-------|-----------|----------|
| "Admin full access" | ALL | `is_admin()` | NULL | ⚠️ is_admin() retorna FALSE |
| "Profiles visibility" | SELECT | `id = auth.uid() OR get_my_role() = 'admin' OR ...` | NULL | ✅ OK |
| "Self profile update" | UPDATE | `id = auth.uid()` | `(id = auth.uid() AND (is_admin() OR no change role))` | ❌ Admin NO puede editar otros |

**Problema Específico:**
- "Admin full access" existe pero es inútil porque `is_admin() = false`
- "Self profile update" solo permite editar el propio perfil
- **No hay policy que permita admin editar perfiles ajenos**

---

### DESPUÉS (✅ Admin puede gestionar)

| Policy | Operación | USING | WITH_CHECK | Propósito |
|--------|-----------|-------|-----------|----------|
| (todas las anteriores) | ... | ... | ... | Se mantienen igual |
| **"profiles_admin_full_access"** (NUEVA) | ALL | `is_admin()` | `is_admin()` | ✅ Admin pueda hacer todo |

**Mejoras:**
- ✅ Nueva policy "profiles_admin_full_access" con `is_admin()` ahora correcto
- ✅ Admin puede INSERT/UPDATE/DELETE cualquier profile
- ✅ Permite desactivar usuarios, cambiar roles, etc.

---

## 🔧 TABLA 3: Funciones RLS - ANTES vs DESPUÉS

### `is_admin()`

**ANTES:**
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

**Problema:**
- `role::text` convierte ENUM a text
- Comparación `IN ('admin', 'superadmin')` falla con el ENUM
- `EXISTS` retorna FALSE cuando el perfil no existe

---

**DESPUÉS:**
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

**Mejoras:**
- `role = ANY(ARRAY[...])` compara ENUM con ENUM ✅
- Más eficiente y seguro
- Retorna `true` para admins reales

---

### `get_my_role()`

**ANTES:**
```sql
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;  -- Puede retornar NULL
END;
```

**Problema:**
- Si el perfil no existe, v_role = NULL
- Las policies que usan `get_my_role() = 'admin'::text` falla con NULL

---

**DESPUÉS:**
```sql
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'usuario');  -- Default seguro
END;
```

**Mejoras:**
- Nunca retorna NULL
- Default: 'usuario' (rol más bajo)
- Mejor manejo de edge cases

---

## 🔐 ANÁLISIS DE SEGURIDAD

### ¿Se relajó la seguridad?

**NO. Evidencia:**

#### Aislamiento Multi-tenant

**ANTES:**
```sql
-- stores_visibility (SELECT)
USING: is_admin() OR EXISTS (... memberships ...)
```

**DESPUÉS:**
```sql
USING: is_admin() OR EXISTS (... memberships ...)
-- IGUAL
```

✅ Multi-tenant aislamiento **INTACTO**

#### Auth Check

**ANTES y DESPUÉS:**
```sql
-- Siempre verifica auth.uid()
WHERE id = auth.uid()
-- O comprueba membership con auth.uid()
WHERE user_id = auth.uid()
```

✅ Autenticación **INTACTA**

#### Role-Based Access

**ANTES:**
- Admin bloqueado (is_admin() falso)

**DESPUÉS:**
- Admin habilitado (is_admin() true)
- Otros roles sin cambios

✅ RBAC **FUNCIONA AHORA**

---

## 📈 IMPACTO POR OPERACIÓN

### CREATE (INSERT)

| Tabla | Antes | Después | Change |
|-------|-------|---------|--------|
| stores | ❌ 403 (is_admin false) | ✅ OK | FIXED |
| profiles | ✅ OK | ✅ OK | NONE |

---

### READ (SELECT)

| Tabla | Antes | Después | Change |
|-------|-------|---------|--------|
| stores | ❌ 403/confused | ✅ OK | FIXED |
| profiles | ⚠️ Depends | ✅ OK | FIXED |

---

### UPDATE

| Tabla | Antes | Después | Change |
|-------|-------|---------|--------|
| stores | ❌ 403 | ✅ OK | FIXED |
| profiles | ❌ 403 (otros) | ✅ OK | FIXED |

---

### DELETE

| Tabla | Antes | Después | Change |
|-------|-------|---------|--------|
| stores | ❌ 403 | ✅ OK | FIXED |
| profiles | ❌ 403 | ✅ OK | FIXED |

---

## 🚨 Edge Cases Considerados

### Case 1: User sin profile en `profiles` table

**Antes:**
```sql
SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
-- v_role = NULL (no existe)
-- is_admin() retorna false
-- User bloqueado de todo
```

**Después:**
```sql
-- get_my_role() retorna 'usuario' (default)
-- is_admin() retorna false (correcto)
-- User tiene acceso mínimo (esperado)
```

✅ Mejor handling

---

### Case 2: Admin intenta ver stores de otro tenant

**Policies:**
```sql
-- stores_select_admin_or_member
USING: is_admin()  -- TRUE para admin
OR EXISTS (... membership check ...)
```

**Admin VE todas las stores:** ✅ Correcto para Super-admin  
**User solo ve su tienda:** ✅ Correcto (membership check)

---

### Case 3: Admin intenta borrar tienda

**Antes:**
```sql
-- "Stores management" (ALL)
USING: is_admin()  -- FALSE
-- BLOCKED
```

**Después:**
```sql
-- "stores_delete_admin" (DELETE)
USING: is_admin()  -- TRUE
-- ALLOWED
```

✅ Funciona

---

## 📝 GRANTS - Sin Cambios

```sql
-- Mantienen igual (nunca fueron problema)
GRANT ALL ON public.stores TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.user_store_memberships TO authenticated;
```

---

## ✅ VALIDACIÓN FINAL

### Seguridad Post-Fix

```
✅ RLS activa (no está deshabilitada)
✅ auth.uid() verificado en toda política
✅ Multi-tenant aislamiento preservado
✅ Role-based access control funciona
✅ Admin tiene permisos apropiados
✅ Users no pueden ver datos ajenos
```

### Performance

```
✅ Misma complejidad (4 políticas vs 3 conflictivas)
✅ Índices sin cambios
✅ Queries sin cambios
✅ Sin degradación esperada
```

---

**Conclusión:** ✅ Seguridad mejorada, no relajada. Admin desbloqueado, users aislados.
