# Audit Closure Report v1.0

**Fecha:** 2026-08-02
**Versión del sistema:** v2.12.50
**Estado:** ✅ CERRADO

---

## 1. Alcance Auditado

```
Backup/Restore                    — Iteración 7
Bulk Operations                   — Iteración 8
User Management                   — Iteración 9
Authorization Model               — Iteración 9
Database Security                 — Iteraciones 7-9
API Security                      — Iteraciones 7-9
Frontend privilege boundaries     — Iteraciones 8-9
```

**Migrations aplicadas:** 6 (v2.12.45 → v2.12.50)
**Período:** 2026-08-02
**Pruebas ejecutadas:** 30+ (PT-7.x, PT-8.x, PT-9.x, PT-9.5)

---

## 2. Riesgos Críticos Encontrados y Resueltos

| Riesgo | Iteración | Resolución | Evidencia |
|--------|-----------|------------|-----------|
| RPC `SECURITY DEFINER` expuestas a `anon`/`PUBLIC` sin auth check | 9 | Auth checks internos (`auth.uid()` + `role='admin'`) en 4 RPCs bulk + `REVOKE EXECUTE ON ALL FUNCTIONS FROM anon, PUBLIC` | 0 SECURITY DEFINER con anon/PUBLIC |
| Bulk delete sin confirmación server-side | 8 | Nuevo flujo: preview → `confirmation_token` → `override_token` (protegidas) → execute atómico | PT-8.5, PT-8.10, PT-8.12 |
| Endpoint legacy aceptaba `action='delete'` sin token | 9 | `delete` removido del Zod enum; legacy devuelve `410 Gone` | PT-9.5.3 |
| 5 RPCs `admin_*` legacy sin callers ni auth check | 9 | `DROP FUNCTION` — eliminadas del schema | 0 funciones `admin_*` restantes |
| Creación parcial de usuarios (fallback no atómico) | 9 | Fallback eliminado; único flujo: `auth.createUser` → RPC transaccional → rollback si falla | PT-9.5.4 |
| `soft_delete_store` sin auth check interno | 9 | Agregado `auth.uid()` + `role='admin'` | PT-9.2 |
| Falta de validación de dependencias antes de soft-delete | 8 | `validate_store_can_be_modified` ampliada (+2 checks: reservations, purchase_orders) | PT-8.2 |
| Backup restore sin truth model | 7 | `source_of_truth` en `backup_table_registry`; `inventory` = primary, `stock_movements` = audit | PT-8.8 |
| Triggers interferían con restore | 7 | `SET LOCAL app.restore_mode='true'` + bypass en 9 triggers | PT-8.3, PT-8.6 |
| No había rate limit por hora en bulk ops | 8 | `check_bulk_ops_hourly_limit` + `bulk_ops_log` | PT-8.1 |
| No había auditoría previa al execute | 8 | `bulk_ops_log` insert antes de execute + `audit_logs` post-completion | PT-8.4 |

---

## 3. Estado de Controles Actuales

| Control | Estado | Evidencia |
|---------|--------|-----------|
| RBAC (roles globales + por tienda) | ✅ | 5 roles en `roles` table, 7 en enum, `canManageStore()` canónico |
| RLS | ✅ | 127/127 tablas con RLS, 353 policies, 0 SECURITY DEFINER con anon/PUBLIC |
| API authorization | ✅ | 18 endpoints con `withRole('admin')`, CSRF en todos, Zod validation |
| Database privilege model | ✅ | Auth checks internos en RPCs sensibles, defense in depth |
| Audit logging | ✅ | `audit_logs`, `user_audit_log`, `bulk_ops_log`, `restore_sessions` |
| Backup recovery | ✅ | `restore_store_backup()` transaccional con rollback + snapshot previo |
| Regression prevention | ⚠️ Parcial | 6 reglas documentadas (R-REG-01 a 06), **CI Gate pendiente** |

---

## 4. Próxima Mejora Recomendada (fuera de auditoría)

### Implementar Security CI Gate

**Prioridad:** Máxima

Actualmente la protección depende de disciplina del desarrollador. Cada PR/migration debería fallar automáticamente si detecta:

| Check | Query/Validación |
|-------|-----------------|
| Nueva `SECURITY DEFINER` sin auth check | `SELECT count(*) FROM pg_proc WHERE prosecdef=true AND pg_get_functiondef(oid) NOT LIKE '%auth.uid%' AND pg_get_functiondef(oid) NOT LIKE '%ERR_PERMISSION_DENIED%'` |
| Grants `PUBLIC`/`anon` | `SELECT count(*) FROM information_schema.role_routine_grants WHERE grantee IN ('anon','PUBLIC') AND routine_schema='public'` |
| Tabla nueva sin RLS | `SELECT count(*) FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND relrowsecurity=false` |
| Endpoint destructivo sin schema validation | Grep: rutas con DELETE/POST destructivo sin `z.object` |
| Cambios de roles sin migration documentada | Grep: `CREATE OR REPLACE FUNCTION` que modifica auth sin `COMMENT ON` |

**Implementación sugerida:** Script SQL + TypeScript que se ejecuta en GitHub Actions antes de merge. Si cualquier check retorna > 0, el PR falla.

---

## 5. Backlog Priorizado

### Prioridad Alta

| ID | Deuda | Razón |
|----|-------|-------|
| DT-03 | `tenant_id` NULL — decisión multi-tenant | Define arquitectura de aislamiento del producto |
| DT-06 | Reconciliación `auth.users` ↔ `profiles` | Usuarios fantasma pueden seguir logueando |
| — | Security CI Gate | Previene regresiones automáticamente |

### Prioridad Media

| ID | Deuda | Razón |
|----|-------|-------|
| DT-01 | Consolidar `is_admin()` / `is_global_admin()` | 57 RLS policies dependen de ambas |
| DT-02 | `manage_user_memberships` sin `auth.uid()` explícito | Usa `get_my_role()` pero no verifica identidad |
| DT-05 | Normalizar plan enum | `basico/profesional` vs `free/pro` causa mismatch silencioso |
| DT-08 | Cleanup job `bulk_ops_log` | Crecimiento indefinido |
| DT-09 | Cleanup job tokens expirados | Crecimiento indefinido |
| DT-12 | Store de laboratorio `BACKUP_RESTORE_TEST` | Pruebas destructivas sobre tiendas productivas |

### Prioridad Baja

| ID | Deuda | Razón |
|----|-------|-------|
| DT-04 | `UNIQUE(email)` en profiles | 0 duplicados, no urgente |
| DT-07 | Dev-bypass auditoría | Ya gateado por NODE_ENV |
| DT-10 | Bulk archive/restore | Fase 2 diferida |
| DT-11 | Bulk create stores | Fase 2 diferida |
| DT-13 | Snapshot externo >100MB | Tiendas actuales <100KB |
| DT-14 | `managed_create_user` 6 redefinitions | v6 es definitiva, documentado |
| DT-15 | Password min length 8 vs 6 | Unificar a 8 |
| DT-16 | `resetPasswordSchema` dead field | Remover |
| DT-17 | Bulk memberships DRY | Usar `getSupabaseAdminSafe()` |
| DT-18 | `manager` como global role | Alinear con definición |

---

## 6. Acta de Cierre

```
Security Hardening Audit v2.12.50

Estado: ✅ CERRADO

Cobertura:
  Seguridad BD:              aprobada
  Autorización:              aprobada
  Operaciones críticas:      aprobadas
  Recuperación:              aprobada

Migrations aplicadas: 6 (v2.12.45 → v2.12.50)
Pruebas ejecutadas: 30+ (PT-7.x a PT-9.5)
Riesgos críticos resueltos: 11
RPCs eliminadas: 5 (admin_* legacy)
REVOKE aplicado: ALL FUNCTIONS FROM anon, PUBLIC
Reglas de regresión: 6 (R-REG-01 a R-REG-06)
Deuda técnica registrada: 18 items (3 Alta, 6 Media, 9 Baja)

Pendiente (fuera de auditoría):
  - Audit Closure Report v1.0          ← este documento
  - Implementación Security CI Gate
  - Ejecución de backlog técnico

Fecha de cierre: 2026-08-02
Versión: v2.12.50
```

---

*Este documento sirve como acta formal de cierre del ciclo de auditoría de seguridad. Los 18 items de deuda técnica quedan registrados en el backlog y no se perderán. La próxima mejora de mayor impacto es el Security CI Gate para prevenir regresiones automáticamente.*
