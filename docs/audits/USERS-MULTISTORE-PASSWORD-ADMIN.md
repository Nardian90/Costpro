# USERS-MULTISTORE-PASSWORD-ADMIN — Informe de Remediación

**Rama:** `fix/users-multistore-admin-password`
**Fecha:** 2026-10-04
**Alcance:** Inicio → SISTEMA → Usuarios (módulo completo) + `/api/users/reset-password`

---

## A. Baseline

| Item | Valor |
|---|---|
| Branch base | `main` @ `98f9ba08af8d4d69de787b8f67d4715eaa876428` |
| origin/main | `98f9ba08af8d4d69de787b8f67d4715eaa876428` (idéntico, verificado) |
| Worktree inicial | Limpio (sin cambios ajenos) |
| App | pm2 `costpro` online, HTTP 200 (puerto 3000) |
| Rama de trabajo | `fix/users-multistore-admin-password` (exclusiva, creada desde `main`) |

---

## B. Problema UX (antes / después)

### Antes
- La columna "Accesos Multi-Tienda" renderizaba **un chip por membership**
  (`min-w-[80px]`, con rol + nombre truncado). Con 5+ tiendas los chips se
  apilaban en múltiples líneas: filas altísimas, wrapping horizontal y la
  columna de acciones (3 botones inline) quedaba desplazada/fuera del
  viewport.
- La columna "Acciones" mostraba 3 botones siempre visibles
  (Editar / Reiniciar contraseña / Eliminar) — sin patrón de overflow, con
  wrapping creciente según el contenido de las demás columnas.
- "Reiniciar contraseña" solo enviaba un **correo de recuperación**; usuarios
  finales con baja alfabetización digital no podían completar el flujo.

### Después
- **Columna Tiendas compacta:** un único badge `N tiendas` / `1 tienda`
  (o "Sin asignaciones"). El badge abre un **Popover** (Radix, existente en el
  design system) con la lista completa `Tiendas asignadas (N)`: nombre
  completo de cada tienda, rol por tienda (color según jerarquía) y marca
  **"Activa"** cuando `store_id === profiles.active_store_id`. La lista tiene
  scroll propio (`max-h-56`) para N grande. **Ninguna tienda se oculta del
  acceso.**
- **Columna Acciones estable:** menú de overflow **⋮ "Opciones"** (patrón
  certificado de `InventoryTableView`): `Editar usuario`, `Cambiar
  contraseña` (nuevo), `Enviar correo de recuperación` (flujo preexistente
  conservado), `Eliminar usuario` (deshabilitado en la propia fila). Un solo
  botón compacto por fila — sin wrapping, accesible en móvil y desktop.
- Verificado con fixtures de 1, 3, 5 y 10 tiendas en tests de componente
  (`users-multistore-view.test.tsx`): el badge permanece estable, la columna
  de acciones existe exactamente una vez por fila y los nombres largos nunca
  se vuelcan en la tabla.

Archivos: `UsersManagementView.tsx` (columnas Tiendas y Acciones),
`SetPasswordModal.tsx` (nuevo), `useUsersView.ts` (handlers nuevos),
`UserAuditHistoryModal.tsx` (label de nueva acción de auditoría).

---

## C. Arquitectura (mapa real encontrado — FASE 1, read-only)

```text
Auth User (Supabase auth.users)
  ↓ id (uuid compartido)
profiles (id PK, full_name, email, role: user_role GLOBAL, roles[],
          is_active, deleted_at, active_store_id, plan,
          max_stores_limit, max_users_limit)
  ↓ profiles.id = user_store_memberships.user_id
user_store_memberships (user_id, store_id, role: user_role POR TIENDA, status)
  ↓ store_id
stores (id, name, address, is_active)
  ↓
Rol/Permisos: profiles.role GLOBAL (admin/superadmin/encargado/manager/
clerk/warehouse/usuario/costo) + memberships por tienda + src/lib/roles.ts
```

- **UI módulo:** `UsersManagementView` + `useUsersView` + `UserFormModal/
  UserForm` + `UserAuditHistoryModal` + `OrphanUsersPanel` +
  `BulkStoreAssignModal` + `RolesManagementView` + `SoftDeleteConfirmModal`.
- **API existente:** `/api/users` (GET), `/api/users/[id]`, `/api/users/delete`
  (RPC `managed_soft_delete_user` + `auth.admin.updateUserById` ban 87600h),
  `/api/users/managed-create`, `/api/users/orphans`,
  `/api/users/reset-password`, `/api/users/toggle-status`
  (RPC `managed_toggle_user_status` + `auth.admin.signOut` al desactivar).
- **Auditoría de usuarios:** tabla `user_audit_log` (performed_by,
  target_user_id, action, old_values, new_values, metadata; CHECK
  `performed_by NOT NULL OR action LIKE 'SYSTEM_%'`; RLS lectura
  admin/manager/encargado), consumida por `useUserAuditHistory` +
  `UserAuditHistoryModal`. Los RPCs `managed_*` auditan atómicamente.
- **No se creó ninguna segunda gestión** (ni de usuarios, ni de tiendas, ni
  de memberships): todo se apoya en los mecanismos anteriores.

---

## D. Autorización (cómo se determina Super Admin — FASE 5)

Mecanismo canónico **existente y reutilizado** (cero inventos):

1. **Cliente:** `useAuthStore` expone `user.role`; el módulo Usuarios solo es
   plenamente funcional con `user?.role === 'admin'` (`isAdmin`).
2. **Servidor:** el handler de `/api/users/reset-password` está envuelto en
   `withRole('admin', …)` (`src/lib/auth-middleware.ts`):
   - `getServerSession` valida el JWT → **401** si no hay sesión.
   - Enriquece la sesión con `profiles.role` + memberships (service_role,
     server-side) vía `getSupabaseAdminSafe()`.
   - `hasRole(profile, 'admin')` → **403** si el rol global no es admin.
3. **Base de datos:** los RPC `managed_*` re-verifican
   `profiles.role IN ('admin','superadmin')` (defensa en profundidad,
   SECURITY DEFINER).
4. **NO existe autorización por email hardcodeado.** `admin@demo.com` accede
   porque su profile tiene rol `admin`. Prueba: el test
   `users-reset-password-authz.test.ts > El endpoint NO autoriza por
   coincidencia de email` envía `email: 'admin@demo.com'` con
   `profiles.role='clerk'` → **403**.

---

## E. Contraseña (flujo completo — FASE 6/7/8)

```text
UI (SetPasswordModal, UsersManagementView)
  → POST /api/users/reset-password  { user_id, new_password }
      headers: Authorization: Bearer <access_token> (patrón existente)
  → server boundary: withRole('admin') → 401/403 + validateOrigin (CSRF)
      + rateLimit + resetPasswordSchema (zod, mín. 8)
  → bloqueo self-reset (user_id === session.user.id → 400)
  → validación de objetivo: profiles.id existente y deleted_at IS NULL
      (no encontrado → 404)
  → Supabase Auth Admin (EXCLUSIVAMENTE server-side):
        supabaseAdmin.auth.admin.updateUserById(user_id, { password })
        (service_role vía getSupabaseAdminSafe — jamás llega al cliente)
  → Auditoría: INSERT user_audit_log
        { performed_by: admin, target_user_id, action: 'PASSWORD_SET_BY_ADMIN',
          metadata: { method: 'admin_direct_set' } }
  → respuesta sanitizada: { success: true, message } — sin datos sensibles
```

- **Esquema zod preexistente** (`resetPasswordSchema`) ya contemplaba
  `new_password` (mín. 8) y `send_reset_email`; la ruta anterior los ignoraba.
  Se extendió la MISMA ruta (no se creó un segundo endpoint).
- El flujo de **correo de recuperación** (sin `new_password`) queda intacto:
  RPC `managed_reset_password` + `generateLink({type:'recovery'})`.
- UI `SetPasswordModal`: título "Cambiar contraseña", usuario objetivo visible
  (nombre + email), campos Nueva/Confirmar con mostrar/ocultar, validación de
  política y coincidencia, loading, error, éxito y **prevención de doble
  submit**. "Cambiar contraseña" está deshabilitado en la propia fila del
  admin (el cambio propio vive en Configuración, como ya existía).

---

## F. Seguridad (confirmaciones)

| Requisito | Estado | Evidencia |
|---|---|---|
| `service_role`/secret solo server-side | ✓ | Clave únicamente en `getSupabaseAdminSafe()` (API route). El cliente (browser bundle) nunca la recibe; `SetPasswordModal` solo envía `{user_id, new_password}` al endpoint. |
| Sin persistencia de contraseñas | ✓ | La contraseña vive solo en el estado local del modal y en el cuerpo del POST; se limpia al cerrar/fallar. Tests: `set-password-modal.test.tsx > la contraseña no se persiste en localStorage/sessionStorage`. |
| Sin logs de contraseñas | ✓ | `logger.error` solo recibe `{userId, error.message}` de Supabase (mensaje de política, nunca el valor). Tests: `users-reset-password-direct.test.ts > la contraseña jamás llega a los logs`. |
| Auditoría sin secretos | ✓ | La fila de auditoría solo contiene actor/objetivo/acción/método. Test: `audita PASSWORD_SET_BY_ADMIN … SIN la contraseña` (aserción: JSON de la fila no contiene el valor ni la cadena "password"). |
| 401 no autenticado | ✓ | Test con `withRole` REAL: 401. |
| 403 sin privilegio (clerk/encargado) | ✓ | Tests con `withRole` REAL: 403 en ambos roles. |
| Anti-spoof por email | ✓ | Test: email `admin@demo.com` + role clerk → 403. |
| Objetivo inexistente → error seguro | ✓ | 404 `Usuario no encontrado` (sin filtrar existencia previa por diferencia de mensajes). |
| ID manipulado | ✓ | El `userId` se valida contra `profiles` (soft-delete) y la autorización es de rol global; un usuario autorizado no puede elevar privilegios: la operación solo cambia la contraseña del objetivo (mismo primitivo que Supabase Admin API) y queda auditada con `performed_by`. |
| CSRF / rate-limit | ✓ | `validateOrigin` + `rateLimit` ya presentes en la ruta (intactos). |

---

## G. Prueba funcional real (FASE 13 — entorno aislado)

Script `scripts/users-password-flow-test.mjs` (service_role, server-side;
usuario de prueba NUEVO `qa-costpro-pwdadmin-*@qa-test.local`, rol clerk,
**sin memberships, sin tiendas, sin tenant** — no tocó ENER-VIDA/VITALLCONS
ni ningún usuario real):

```text
✓ Trigger creó el profile del usuario de prueba (rol clerk)
✓ Usuario de prueba SIN memberships (0 tiendas)
✓ Login con contraseña inicial → OK
✓ Sesión A obtenida (usuario "autenticado" antes del cambio)
✓ updateUserById(admin) sin error            ← operación de la ruta
✓ Login con contraseña ANTERIOR → FALLA      — "Invalid login credentials"
✓ Login con NUEVA contraseña → FUNCIONA
✓ Perfil intacto (mismo id/rol/estado/full_name)
✓ Memberships del usuario de prueba intactas (0 → 0)
✓ Ningún otro profile alterado   (profiles 198 → 199, solo el usuario QA)
✓ Ninguna membership global alterada (1549 → 1549)
```

**Limpieza (patrón sancionado de la propia app):** el hard-delete está
prohibido por política del producto (`prevent_hard_delete_profile`,
Iteración 12 Q6 — por eso `auth.admin.deleteUser` devuelve 500). Se aplicó el
mismo procedimiento que usa `/api/users/delete`: **soft-delete del profile**
(`deleted_at` + `is_active=false`) + **ban de auth 87600h** (banned_until
2036). Resultado: 0 memberships, invisible en el módulo Usuarios, sin sesión
posible. Sin filas falsas de auditoría (la verificación de auditoría se hace
por tests unitarios del route).

---

## H. Regresión

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| ESLint (9 archivos tocados) | 0 errores / 3 warnings advisory `V2.12.25` (botón crudo en triggers Radix asChild — mismo patrón certificado de `InventoryTableView`; preexistente en el codebase) |
| Suite completa `npx vitest run` | **2502 passed / 24 skipped / 0 failed** (130 archivos) |
| Tests nuevos | 30 (route directo 9, autorización real 5, SetPasswordModal 7, vista multi-tienda 9) |
| Temas Dark/Light/Performance | Tokens semánticos exclusivamente (`bg-card`, `text-foreground`, `border-border`, `bg-muted/30`…); cero colores hardcodeados; misma paleta del módulo preexistente |
| Responsive | Columna Tiendas: `hidden sm:table-cell` (comportamiento preexistente intacto); badge + Popover funcionan en 320–400 px (Radix Popover reposiciona; lista con scroll); menú ⋮ con target táctil 40×40 px (`min-h-[40px]`), botones del modal `min-h-[44px]`; desktop 1280/1440: fila estable con 1 chip |
| Accesibilidad | `aria-label` en trigger ⋮ (`Opciones de {nombre}`) y en badge de tiendas; `aria-haspopup="menu"/"dialog"`; labels asociados (`htmlFor`); `aria-invalid` + `aria-describedby` en errores; foco inicial en el primer campo; Escape/click-fuera cierran popover y modal (Radix); menú navegable por teclado (Radix DropdownMenu); ítem "Cambiar contraseña" deshabilitado en la propia fila |

**Zonas NO tocadas (FASE 17 — gate de diff):** `supabase/` (migraciones/RLS/
funciones), `auth-middleware.ts`, inventario, ventas, Caja, Fichas de Costo,
Darian, navegación, CI. `git diff --name-only` confirma 9 archivos, todos en
`src/app/api/users/reset-password`, `src/components/views/terminal/views/users/`
y `src/__tests__/`.

---

## Veredicto

**CERTIFIED** — criterios del mandato: representación compacta multi-tienda
con detalle completo (popover), columna de acciones estable con todas las
funcionalidades existentes conservadas, seteo directo de contraseña por Super
Admin exclusivamente server-side (Supabase Auth Admin), autorización real por
rol (sin hardcodeo, anti-spoof verificado), 401/403 funcionando, contraseña
anterior invalidada y nueva operativa (prueba real), sesiones: Supabase
**revoca automáticamente** access y refresh tokens al cambiar contraseña por
Admin API (observado empíricamente — ver abajo), memberships/roles intactos,
auditoría `PASSWORD_SET_BY_ADMIN` sin secretos, temas/responsive/accesibilidad
con tokens del design system, regresión limpia y Git verificado.

### FASE 10 — Comportamiento real de sesiones (documentado)

Observación empírica (FASE 13, usuario de prueba autenticado antes del
cambio):

```text
Super Admin cambia contraseña (auth.admin.updateUserById)
  → access_token previo:  INVALIDADO ("Auth session missing!")
  → refresh_token previo: INVALIDADO ("Invalid Refresh Token: Not Found")
  → siguiente login: exige la nueva contraseña
```

Conclusión: **no se implementó cierre forzado adicional** — Supabase Auth ya
revoca las sesiones existentes al modificar la contraseña por Admin API. El
comportamiento resultante es el deseado por producto: el usuario final entra
con la contraseña entregada por el administrador y ninguna sesión vieja
permanece válida.
