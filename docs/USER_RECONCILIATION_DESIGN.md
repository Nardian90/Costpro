# User Reconciliation Design

**Fecha:** 2026-08-02
**Deuda técnica:** DT-06
**Estado:** Diseño (pendiente aprobación)

---

## 1. Problema

Cuando `managed_delete_user` borra el profile pero `auth.admin.deleteUser` falla, queda un `auth.users` huérfano — el usuario puede seguir iniciando sesión pero no tiene profile, memberships ni rol.

**FK real:** `profiles_id_fkey → auth.users(id) ON DELETE NO ACTION` (no CASCADE)

---

## 2. Diseño Propuesto

### 2.1 Detección de huérfanos

**Tabla nueva:** `orphaned_users_log`

```sql
CREATE TABLE IF NOT EXISTS public.orphaned_users_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID NOT NULL,
  email           TEXT,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT CHECK (resolution IN ('auth_deleted', 'profile_restored', 'manual_review')),
  resolved_by     UUID,
  metadata        JSONB
);

ALTER TABLE public.orphaned_users_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY orphaned_log_admin ON public.orphaned_users_log
  FOR ALL TO authenticated USING (public.is_admin());
```

### 2.2 Job periódico de detección

**Frecuencia:** Cada hora (vía Supabase Edge Function o cron)

**Lógica:**
1. Listar `auth.users` via `auth.admin.listUsers()`
2. Para cada user, verificar si existe en `profiles`
3. Si NO existe → insertar en `orphaned_users_log`

**Implementación:** Supabase Edge Function o script Node.js ejecutado vía cron.

```typescript
// scripts/reconcile-orphaned-users.ts
async function detectOrphans() {
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const orphans = [];

  for (const user of authUsers.users) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      orphans.push({
        auth_user_id: user.id,
        email: user.email,
        detected_at: new Date().toISOString(),
      });
    }
  }

  if (orphans.length > 0) {
    await supabaseAdmin.from('orphaned_users_log').insert(orphans);
    // Alertar via log
    logger.warn('SECURITY', 'ORPHANED_USERS_DETECTED', { count: orphans.length });
  }

  return orphans;
}
```

### 2.3 Estrategia de recuperación

| Escenario | Acción | Automático? |
|-----------|--------|:---:|
| auth.users sin profile, creado hace < 1h | Esperar (puede ser creación en progreso) | ✅ |
| auth.users sin profile, creado hace > 1h | `auth.admin.deleteUser()` | ✅ |
| auth.users sin profile pero con audit_log de delete | Confirmar delete | ✅ |
| auth.users sin profile, sin audit_log | Alerta manual | ❌ |

### 2.4 Reconciliación automática

```typescript
async function reconcileOrphans() {
  const { data: orphans } = await supabaseAdmin
    .from('orphaned_users_log')
    .select('*')
    .is('resolved_at', null);

  for (const orphan of orphans) {
    const age = Date.now() - new Date(orphan.detected_at).getTime();
    const oneHour = 60 * 60 * 1000;

    if (age < oneHour) {
      // Skip — might be creation in progress
      continue;
    }

    // Check if there's an audit_log for this user deletion
    const { data: auditEntry } = await supabaseAdmin
      .from('audit_logs')
      .select('id')
      .eq('metadata->>user_id', orphan.auth_user_id)
      .ilike('action', '%delete%')
      .limit(1);

    if (auditEntry && auditEntry.length > 0) {
      // Profile was deleted, auth should be too
      await supabaseAdmin.auth.admin.deleteUser(orphan.auth_user_id);
      await supabaseAdmin
        .from('orphaned_users_log')
        .update({
          resolved_at: new Date().toISOString(),
          resolution: 'auth_deleted',
        })
        .eq('id', orphan.id);
    } else {
      // No audit log — manual review needed
      logger.error('SECURITY', 'ORPHANED_USER_MANUAL_REVIEW', {
        auth_user_id: orphan.auth_user_id,
        email: orphan.email,
      });
    }
  }
}
```

---

## 3. Tabla de Auditoría

`orphaned_users_log` registra:
- `auth_user_id` — el usuario huérfano
- `email` — para identificación
- `detected_at` — cuándo se detectó
- `resolved_at` — cuándo se resolvió
- `resolution` — cómo se resolvió
- `resolved_by` — quién lo resolvió (NULL si automático)
- `metadata` — contexto adicional

---

## 4. Implementación

| Componente | Tipo | Esfuerzo |
|------------|------|----------|
| Tabla `orphaned_users_log` | SQL migration | Bajo |
| Script `reconcile-orphaned-users.ts` | Node.js | Medio |
| Cron/Edge Function | Supabase | Bajo |
| Alerta (log + email) | Logger | Bajo |

---

## 5. Estado

```
Diseño:              ✅ Completo
Implementación:      ⏳ Pendiente aprobación
Prioridad:           Alta (DT-06)
```

**No implementar hasta aprobación.** Este documento define el diseño pero no debe aplicarse sin revisión del flujo de eliminación completo.
