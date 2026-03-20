# 🧪 GUÍA DE VALIDACIÓN MANUAL - Test RLS Fixes en Frontend

**Objetivo:** Validar que las correcciones RLS funcionan correctamente desde la aplicación React
**Duración esperada:** 15 minutos
**Requisitos:** Usuario Admin logeado, acceso a 2+ tiendas activas

---

## 📌 SETUP PRE-PRUEBAS

### 1. Limpiar cache

```typescript
// En la consola del browser (DevTools F12)
// Limpiar React Query cache
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### 2. Esperar caché PostgREST (1 min)

Supabase PostgREST puede tardar 30-60 segundos en actualizar el schema cache.
Mientras esperas, revisa la consola de navegador (F12 → Console) para errores.

---

## ✅ TEST 1: Admin PUEDE VER TIENDAS (SELECT)

### Paso 1: Navegar a Stores

**UI:** Menú izquierdo → "Gestión" → "Tiendas" (o similar según navegación)

**Resultado esperado:**
- ✅ Se cargan 2+ tiendas en la lista
- ✅ NO hay error HTTP 403/401
- ✅ Se ve nombre, dirección, estado (activo/inactivo)

### Paso 2: Revisar consola de navegador

**DevTools (F12) → Console:**

```
// Buscar logs de la store service
[DATABASE] select stores: { success: true, count: 2 }
// O similar indicando que el SELECT funcionó
```

**Si ves esto, ✅ TEST PASS:**
- No hay errores de CORS
- No hay errores de RLS (403)
- No hay "memberships column not found"

**Si ves esto, ❌ TEST FAIL:**
- Error 403: row security policy blocked access
- Error: "Cannot find memberships column"
- Network error 401

---

## ✅ TEST 2: Admin PUEDE CREAR TIENDA (INSERT)

### Paso 1: Click "Crear Nueva Tienda" o botón similar

**UI:** En la vista de Tiendas, busca botón "+ Nueva Tienda" o "Crear"

### Paso 2: Llenar formulario

```
Nombre: "Test Store " + timestamp (ej: "Test Store 2026-02-09 14:30")
Dirección: "123 Main Street"
Logo URL: (opcional)
Estado: Activo ✓
```

### Paso 3: Hacer click "Guardar" o "Crear"

**Resultado esperado:**
- ✅ Modal se cierra
- ✅ Toast notification: "Tienda creada exitosamente" ✓
- ✅ Nueva tienda aparece en lista
- ✅ NO hay error 403/401

**DevTools Console:**
```
[DATABASE] insert stores: { success: true, id: "uuid..." }
```

**Si falla ❌:**
```
[DATABASE] insert stores: { error: "row security policy blocked" }
// O:
fetch error: 403 Forbidden
```

---

## ✅ TEST 3: Admin PUEDE EDITAR TIENDA (UPDATE)

### Paso 1: Click en tienda recién creada (o existente)

**UI:** En la tabla de tiendas, busca ícono "edit" 🖊️ o haz click en la fila

### Paso 2: Cambiar datos

```
Nombre: "Test Store Updated"
Dirección: "456 Oak Avenue"
```

### Paso 3: Click "Guardar" o "Actualizar"

**Resultado esperado:**
- ✅ Modal se cierra
- ✅ Toast: "Tienda actualizada correctamente"
- ✅ Cambios reflejados en la lista
- ✅ NO hay error 403

**DevTools:**
```
[DATABASE] update stores: { success: true }
```

---

## ✅ TEST 4: Admin PUEDE VER USUARIOS (SELECT)

### Paso 1: Navegar a Usuarios

**UI:** Menú → "Gestión" → "Usuarios"

**Resultado esperado:**
- ✅ Se cargan 3+ usuarios en tabla
- ✅ Se ven columnas: Email, Rol, Tienda, Estado, Acciones
- ✅ NO hay error 403/401

**DevTools:**
```
[DATABASE] select users (admin/encargado): { success: true, count: 4 }
```

---

## ✅ TEST 5: Admin PUEDE EDITAR USUARIO (UPDATE)

### Paso 1: Seleccionar usuario no-admin

**UI:** En tabla de usuarios, haz click en botón "Editar" 🖊️

### Paso 2: Cambiar datos

```
Nombre completo: "John Doe Updated"
Rol: "clerk" (cambiar si es necesario)
Estado: (ver TEST 6 para esto)
Tiendas asignadas: agregar/quitar tiendas
```

### Paso 3: Click "Guardar"

**Resultado esperado:**
- ✅ Modal se cierra
- ✅ Toast: "Usuario actualizado correctamente"
- ✅ Cambios reflejados en tabla
- ✅ NO hay error 403

**DevTools:**
```
[DATABASE] update profiles: { success: true }
[DATABASE] manage_user_memberships: { success: true }
```

---

## ✅ TEST 6: Admin PUEDE DESACTIVAR USUARIO (UPDATE is_active)

### Paso 1: En tabla de usuarios, buscar columna "Estado"

**UI:** Cada usuario debe tener un toggle/checkbox "Activo/Baneado"

### Paso 2: Clickear el toggle para desactivar

**Antes:**
```
Juan Pérez | clerk | Activo ✓
```

**Después de click:**
```
Juan Pérez | clerk | Baneado ✗
```

### Paso 3: Confirmar

**Resultado esperado:**
- ✅ Toggle se cambia inmediatamente
- ✅ Toast: "Usuario desactivado"
- ✅ Usuario sigue en lista pero marcado como inactivo
- ✅ NO hay error 403

**DevTools:**
```
[DATABASE] toggle-status: { success: true }
// O:
[DATABASE] update profiles: { success: true, is_active: false }
```

**Si falla ❌:**
```
fetch error: 403 Forbidden
Error al cambiar estado: row security policy blocked
```

---

## ✅ TEST 7: Usuario NO-ADMIN NO PUEDE VER OTRO USUARIO

### Paso 1: Logout (Cerrar sesión)

**UI:** Menú superior derecha → Logout / Cerrar sesión

### Paso 2: Login como usuario NO-ADMIN

```
Email: usuario-normal@example.com (debe tener rol 'clerk' o 'warehouse')
Password: [su contraseña]
```

### Paso 3: Ir a "Gestión" → "Usuarios"

**Resultado esperado:**
- ⚠️ Ver tablero VACÍO o "No tienes permisos"
- ✅ NO debe ver lista de usuarios (solo admins/encargados ven)
- ✅ Si ve error 403, es correcto (RLS funcionando)

**DevTools:**
```
[DATABASE] select users: { success: true, data: [] }
// O:
Error 403: row security policy blocked
// Ambos son correctos - RLS aislando el acceso
```

---

## ✅ TEST 8: Multi-tenant Aislamiento

### Contexto
- Admin tiene acceso a 2+ tiendas
- Hay usuarios asignados a diferentes tiendas

### Paso 1: Ir a Tiendas

**UI:** Menú → Tiendas

**Resultado esperado:**
- ✅ Admin VE todas las tiendas (2+)

### Paso 2: Ir a Usuarios

**UI:** Menú → Usuarios

### Paso 3: Crear/asignar usuario a Store A

```
Nombre: "User A Only"
Tiendas: Solo "Store A"
```

### Paso 4: Cambiar a "Store B" en selector superior

**UI:** Selector de tienda activa (arriba a la derecha, típicamente)

### Paso 5: Ir a Usuarios nuevamente

**Resultado esperado:**
- ❌ "User A Only" NO debe aparecer en la tabla
- ✅ Solo usuarios de "Store B" deben verse
- ✅ Aislamiento multi-tenant funciona

**Lógica RLS:**
```sql
-- User vee users en su tienda
SELECT * FROM profiles
WHERE EXISTS (
  SELECT 1 FROM user_store_memberships
  WHERE store_id = current_active_store
)
```

---

## 🔴 RESOLUCIÓN DE PROBLEMAS

### Problema: "Error 403: row security policy blocked access"

**Causa probable:** RLS aún rechazando operaciones

**Qué hacer:**
1. Espera 60 segundos (cache PostgREST)
2. Hard refresh del browser: Ctrl+Shift+R (Chrome) o Cmd+Shift+R (Mac)
3. Limpia localStorage: Consola → `localStorage.clear(); location.reload();`
4. Verifica que el usuario loggeado es realmente ADMIN
   ```typescript
   // En consola del browser
   console.log(JSON.parse(localStorage.getItem('auth-store'))); // Ver user actual
   ```

### Problema: "Cannot find memberships column of profiles"

**Causa probable:** PostgREST schema cache no actualizado

**Qué hacer:**
1. Ejecuta en Supabase SQL editor:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
2. Espera 30 segundos
3. Hard refresh del navegador

### Problema: Tiendas/Usuarios vacíos, sin errores

**Causa probable:** is_admin() retorna false (check aún no propagado)

**Qué hacer:**
1. Verifica en Supabase:
   ```sql
   SELECT is_admin(); -- Como usuario logeado
   ```
2. Si retorna `false`, el rol no coincide. Verifica:
   ```sql
   SELECT role FROM profiles WHERE id = auth.uid();
   -- Debe retornar 'admin' o 'superadmin'
   ```

### Problema: Update falla con "column 'X' not found"

**Causa probable:** Payload incluye campos virtuales

**Qué hacer:**
- En `useUpdateUser`, verificar que NO envía: `memberships`, `roles` (solo reales)
- El código ya debería filtrar esto:
  ```typescript
  const { memberships, ...cleanUpdates } = updates;
  // Ahora cleanUpdates solo tiene campos reales
  ```

---

## 📊 CHECKLIST FINAL DE VALIDACIÓN

- [ ] **Test 1:** Admin VE tiendas (SELECT) ✅
- [ ] **Test 2:** Admin CREA tienda (INSERT) ✅
- [ ] **Test 3:** Admin EDITA tienda (UPDATE) ✅
- [ ] **Test 4:** Admin VE usuarios (SELECT) ✅
- [ ] **Test 5:** Admin EDITA usuario (UPDATE) ✅
- [ ] **Test 6:** Admin DESACTIVA usuario (UPDATE is_active) ✅
- [ ] **Test 7:** User NO-admin NO ve usuarios (RLS bloquea) ✅
- [ ] **Test 8:** Multi-tenant aislamiento funciona ✅

**Si todos pasan:** ✅ Sistema operacional, RLS fixes exitosas

---

## 🚀 DEPLOYMENT

Si todo pasa en testing:

1. **Commit cambios:**
   ```bash
   git add supabase/migrations/20260209_fix_critical_rls_issues.sql
   git commit -m "Fix: Restore admin RLS permissions for store/user management"
   git push
   ```

2. **Supabase Auto-Apply:** La migración se ejecuta automáticamente

3. **Frontend:**
   - El código en `useUsersView.ts` ya tiene `is_active` incluido
   - Deploy de frontend (si fue necesario)

4. **Monitoreo Post-Deployment:**
   - Revisar `audit_logs` por errores 403
   - Monitorear que admins pueden crear/editar

---

**Generado:** 9 de febrero de 2026 | Arquitecto: Claude Haiku
**Estado:** Listo para testing manual en UI
