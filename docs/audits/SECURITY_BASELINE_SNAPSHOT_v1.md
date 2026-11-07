# Security Baseline Snapshot v1

**Fecha:** 2026-08-02
**Estado del sistema:** Post-hardening Iteraciones 7-9
**Versión:** v2.12.50

---

## 1. Inventario Final de Superficie Privilegiada

### Matriz de superficie

| Elemento | Cantidad | Estado |
|----------|---------:|--------|
| Funciones totales en `public` | 404 | — |
| `SECURITY DEFINER` | 176 | ✅ Auditadas — 0 con anon/PUBLIC |
| `SECURITY DEFINER` con grant `anon` | **0** | ✅ Eliminado |
| `SECURITY DEFINER` con grant `PUBLIC` | **0** | ✅ Eliminado |
| RPCs expuestas via PostgREST (grant `authenticated`) | 397 | ✅ Con auth checks internos donde corresponde |
| Endpoints API con `withRole('admin')` | 18 | ✅ Documentados |
| Tablas con RLS habilitado | 127/127 (100%) | ✅ Todas las tablas tienen RLS |
| RLS policies totales | 353 | ✅ Inventariadas |
| Tablas con al menos 1 RLS policy | 125 | ✅ |

### Roles globales (`profiles.role`)

| Rol | Count | Descripción |
|-----|------:|-------------|
| `admin` | 2 | Acceso total, bypass memberships |
| `encargado` | 3 | Puede crear usuarios (no admin), gestiona tiendas asignadas |
| `clerk` | 1 | Operaciones POS |
| `warehouse` | 1 | Gestión inventario |
| `costo` | 11 | Módulo costos (default para signup público) |
| **Total** | **18** | |

### Roles por tienda (`user_store_memberships.role`)

| Rol | Active | Revoked | Descripción |
|-----|-------:|--------:|-------------|
| `admin` | 8 | 5 | Membership admin (no equivale a global admin) |
| `manager` | 1 | 0 | Solo membership (no global) |
| `encargado` | 1 | 0 | |
| `clerk` | 3 | 0 | |
| `warehouse` | 1 | 0 | |
| `costo` | 2 | 0 | |

### Roles en tabla `roles`

| Name | is_default | Permissions |
|------|:---:|---|
| Admin | false | all=true, 7 views |
| Encargado | false | Dashboard, Inventory, POS, Reports, Users, Costs |
| Cajero | false | POS |
| Almacenero | false | Inventory |
| costo | **true** | Costs (default para signup público) |

### Endpoints admin (18 con `withRole('admin')`)

| Endpoint | Propósito |
|----------|-----------|
| `POST /api/stores/bulk/preview` | Preview bulk operations |
| `POST /api/stores/bulk/generate-token` | Generate confirmation token |
| `POST /api/stores/bulk/generate-override` | Generate override token |
| `POST /api/stores/bulk/execute` | Execute bulk operations |
| `POST /api/stores/bulk` (legacy) | Activate/deactivate only (delete blocked) |
| `POST /api/stores` | Create store |
| `PATCH /api/stores/[id]` | Update store |
| `DELETE /api/stores/[id]` | Delete store |
| `POST /api/users/managed-create` | Create user |
| `POST /api/users/delete` | Delete user |
| `POST /api/users/toggle-status` | Activate/deactivate user |
| `POST /api/users/reset-password` | Reset password |
| `POST /api/stores/[id]/backup` | Backup store |
| `POST /api/stores/[id]/backup/restore` | Restore backup |
| `POST /api/stores/[id]/reset` | Reset store data |
| + 3 adicionales (roles management, etc.) | |

---

## 2. Reglas de Regresión

**Estos controles NO deben romperse en futuras iteraciones.**

### R-REG-01: Ninguna nueva RPC SECURITY DEFINER sin auth check

**Regla:** Toda función `SECURITY DEFINER` nueva debe incluir al inicio:
```sql
IF auth.uid() IS NOT NULL THEN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED';
  END IF;
END IF;
```

**Excepción:** Funciones STABLE read-only (ej: `validate_store_can_be_modified`) que no modifican datos pueden no requerir admin, pero deben tener `REVOKE FROM anon, PUBLIC`.

### R-REG-02: Ningún endpoint destructivo sin confirmación server-side

**Regla:** Todo endpoint que realice operaciones destructivas (delete, bulk delete, reset) debe:
1. Validar `confirmation_text` en server (Zod)
2. Requerir `confirmation_token` generado server-side
3. Auditar en `bulk_ops_log` o `audit_logs` antes del execute
4. Tener rate limit por hora

### R-REG-03: Ninguna operación administrativa confiando solo en frontend

**Regla:** Toda validación de permisos debe estar en:
1. API route (`withRole('admin')` o `canManageStore`)
2. RPC interna (`auth.uid()` + role check)
**No basta con validar solo en el frontend.**

### R-REG-04: Ninguna función privilegiada con grants PUBLIC/anon

**Regla:** Toda función en schema `public` debe tener:
```sql
REVOKE EXECUTE ON FUNCTION ... FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;
```

**Verificación:** Antes de cerrar cualquier migration, ejecutar:
```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname='public' AND p.prosecdef = true
AND EXISTS (SELECT 1 FROM information_schema.role_routine_grants rg
  WHERE rg.routine_schema='public' AND rg.routine_name = p.proname
  AND rg.grantee IN ('anon', 'PUBLIC'));
-- Debe retornar 0
```

### R-REG-05: Toda creación de usuario debe pasar por el flujo único

**Regla:** La creación de usuarios debe seguir EXACTAMENTE este flujo:
1. `auth.admin.createUser()` → crea auth.users
2. `managed_create_user()` RPC → crea profile + memberships (transaccional)
3. Si RPC falla → `auth.admin.deleteUser()` (rollback completo)
4. **NO existe fallback path**

### R-REG-06: Ningún endpoint legacy puede aceptar operaciones destructivas

**Regla:** Endpoints deprecados deben:
- Rechazar operaciones destructivas con `410 Gone` o `400 Bad Request`
- Redirigir al nuevo flujo seguro
- **Nunca** ejecutar lógica destructiva legacy

---

## 3. Smoke Test Global

**Estado:** Ejecutado el 2026-08-02

### Usuarios

| Operación | Estado | Notas |
|-----------|--------|-------|
| Crear usuario nuevo | ✅ | managed-create funciona (auth.users → RPC → profile + memberships) |
| Asignar tienda | ✅ | manage_user_memberships con auth check |
| Cambiar membresía | ✅ | manage_user_memberships (replace-all con has_store_access) |
| Revocar acceso | ✅ | toggle-status + membership status='revoked' |

### Tiendas

| Operación | Estado | Notas |
|-----------|--------|-------|
| Crear tienda | ✅ | create_store_with_membership RPC |
| Activar/desactivar | ✅ | Legacy endpoint (activate/deactivate only) |
| Bulk operations | ✅ | Nuevo flujo preview → token → execute |

### Inventario

| Operación | Estado | Notas |
|-----------|--------|-------|
| Entrada (recepción) | ✅ | register_reception / fn_process_receipt |
| Venta | ✅ | create_sale RPC |
| Transferencia | ✅ | create_transfer → confirm_transfer → reverse_transfer |
| Kardex | ✅ | auto_kardex_on_stock_movement trigger |

### Backup Restore

| Operación | Estado | Notas |
|-----------|--------|-------|
| Preview | ✅ | restore_store_backup(mode='preview') |
| Restore | ✅ | restore_store_backup(mode='execute') con restore_mode bypass |
| Validación post-restore | ✅ | validate_post_restore (3 checks) |

**Veredicto Smoke Test:** ✅ El hardening no rompió operaciones normales.

---

## 4. Deuda Técnica Oficial (Backlog)

### Deuda de seguridad

| ID | Deuda | Severidad | Iteración origen | Recomendación |
|----|-------|-----------|-----------------|---------------|
| DT-01 | `is_admin()` e `is_global_admin()` son idénticas (57 RLS policies) | Medio | 9 | Hacer `is_global_admin()` alias de `is_admin()` |
| DT-02 | `manage_user_memberships` confía en API route para auth (no tiene `auth.uid()` propio, usa `get_my_role()`) | Medio | 9 | Agregar `auth.uid()` check explícito |
| DT-03 | `tenant_id` NULL en 17/18 profiles y 16/16 stores | Pendiente decisión | 9 | Decidir si multi-tenant es real; si no, eliminar campo de RLS |
| DT-04 | `profiles.email` sin UNIQUE constraint | Bajo | 9 | Agregar UNIQUE (0 duplicados existentes) |
| DT-05 | Plan enum inconsistente (`basico/profesional` vs `free/pro`) | Bajo | 9 | Migración gradual: normalizar DB + UI |
| DT-06 | No hay mecanismo de reconciliación de auth.users huérfanos | Medio | 9 | Job periódico que detecte auth.users sin profile |
| DT-07 | Dev-bypass token sin auditoría visible | Bajo | 9 | Agregar log warning cuando se activa |

### Deuda operativa

| ID | Deuda | Severidad | Iteración origen | Recomendación |
|----|-------|-----------|-----------------|---------------|
| DT-08 | `bulk_ops_log` crece indefinidamente | Bajo | 8 | Cleanup job semanal |
| DT-09 | Tokens expirados no se limpian | Bajo | 8 | Cleanup job: `DELETE FROM bulk_confirmation_tokens WHERE expires_at < NOW()` |
| DT-10 | No hay bulk archive/restore | Bajo | 8 | Fase 2 diferida |
| DT-11 | No hay bulk create stores | Bajo | 8 | Fase 2 diferida |
| DT-12 | Store de laboratorio `BACKUP_RESTORE_TEST` no creado | Medio | 7 | Crear tienda exclusiva para pruebas destructivas |
| DT-13 | Snapshot externo para tiendas grandes (>100MB) | Bajo | 7 | Implementar Supabase Storage para snapshots grandes |

### Deuda de código

| ID | Deuda | Severidad | Recomendación |
|----|-------|-----------|---------------|
| DT-14 | `managed_create_user` tiene 6 redefinitions históricas en migrations | Bajo | Documentar que v6 (actual) es la definitiva |
| DT-15 | Password min length inconsistente (8 vs 6) | Bajo | Unificar a 8 |
| DT-16 | `resetPasswordSchema` tiene `new_password` field no usado | Bajo | Remover dead code |
| DT-17 | Bulk memberships route no usa `getSupabaseAdminSafe()` | Bajo | DRY violation |
| DT-18 | `manager` aceptado como global role en toggle-status | Bajo | Alinear con definición de roles |

---

## 5. Migrations Aplicadas (Iteraciones 7-9)

| Migration | Versión | Iteración | Descripción |
|-----------|---------|-----------|-------------|
| `20260802000006_v2_12_45_backup_registry.sql` | v2.12.45 | 7 | backup_table_registry + restore_sessions + validate_post_restore |
| `20260802000007_v2_12_46_restore_rpc_preview.sql` | v2.12.46 | 7 | Preview mode + snapshot + FK integrity |
| `20260802000008_v2_12_47_restore_rpc_execute.sql` | v2.12.47 | 7 | Execute mode + 9 trigger bypass + rollback |
| `20260802000009_v2_12_48_bulk_delete_safety.sql` | v2.12.48 | 8 | bulk_soft_delete_stores + tokens + backup_restore_protected |
| `20260802000010_v2_12_49_rpc_hardening.sql` | v2.12.49 | 9 | Auth checks en 4 RPCs + REVOKE anon/PUBLIC |
| `20260802000011_v2_12_50_rpc_legacy_cleanup` | v2.12.50 | 9 | DROP 5 admin_* + REVOKE ALL FROM anon/PUBLIC |

---

## 6. Estado Final del Sistema

```
Security Baseline Snapshot v1 — 2026-08-02

Iteración 7: Backup Restore          ✅ Certificada
Iteración 8: Bulk Store Operations   ✅ Certificada
Iteración 9: Managed Create User     ✅ Certificada

Security Hardening:
  ✅ 0 SECURITY DEFINER con anon/PUBLIC
  ✅ 0 RPCs legacy admin_* restantes
  ✅ Endpoint legacy no acepta delete
  ✅ Fallback no atómico eliminado
  ✅ Auth checks internos en RPCs sensibles
  ✅ Defense in depth (API + RPC)

Superficie privilegiada:
  176 SECURITY DEFINER auditadas
  397 RPCs expuestas (authenticated only)
  18 endpoints admin
  353 RLS policies en 125 tablas
  5 roles en tabla roles
  7 roles globales en uso

Deuda técnica: 18 items (7 seguridad, 6 operativa, 5 código)
Reglas de regresión: 6 (R-REG-01 a R-REG-06)
Smoke test: ✅ Aprobado
```
