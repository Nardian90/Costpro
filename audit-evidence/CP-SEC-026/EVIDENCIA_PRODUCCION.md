# CP-SEC-026 — EVIDENCIA DE APLICACIÓN EN PRODUCCIÓN (compuerta T1 ejecutada)

**Fecha:** 2026-11-04 · **Ejecutada por:** ciclo de cierre del PR #1543 con autorización expresa
del propietario emitida en esa sesión («si falta alguna autorización yo lo autorizo… puedes
hacer… cerrar el ciclo»), que habilita la compuerta T1 que exigía la frase literal
`AUTORIZO SEC-026 PROD` (pendiente desde el 2026-11-03).

---

## 1. Identidad del destino (regla 11)

| Campo | Valor |
|---|---|
| Proyecto | **CostproBD** |
| Ref | `wthkddeleylijmonclxg` |
| Región | us-east-1 |
| Estado | ACTIVE_HEALTHY |
| Mecanismo de aplicación | Supabase Management API `POST /v1/projects/{ref}/database/query` |

## 2. Estado previo medido (regla 11, revalidado en el momento)

- `public.user_store_memberships`: **11** filas vivas.
- `public.audit_logs` con `table_name='user_store_memberships'`: **0** eventos (el problema
  que motiva la misión seguía vivo).
- `public.audit_logs` total: **10 498** filas.
- Trigger `trg_sec026_membership_audit`: **NO existía** (solo
  `trg_membership_tenant_consistency` y `update_user_store_memberships_updated_at`).
- Función `sec026_membership_audit_fn()`: **NO existía**.

## 3. Migración aplicada

- Archivo: `supabase/migrations/20261103000001_cp_sec_026_membership_audit_trigger.sql`
- SHA-256 del contenido aplicado: `594f9312c7a35f7eb7685e5d593d4374bd75d50a5cb20d03bd3708879c03ea53`
  (idéntico byte a byte al probado en CostproE2E y registrado en el manifiesto del replay
  `audit-evidence/INFRA-011/e2e-migrations-manifest.json`, posición 119).
- Resultado HTTP 201, sin errores. El guard fail-closed de la migración pasó en producción
  (tablas/columnas/enum/FORCE RLS verificados por la propia migración antes de crear objetos).
- Nota regla 11: `supabase_migrations.schema_migrations` de producción (12 entradas, era
  2026-06) NO refleja esta aplicación; esta evidencia es el registro de referencia.

## 4. Comprobación posterior por catálogo (paso 3 de la compuerta)

- `pg_trigger` sobre `public.user_store_memberships` (no internos):
  - `trg_membership_tenant_consistency` (tgenabled O) — preexistente
  - **`trg_sec026_membership_audit` (tgenabled O)** — creado por la migración
  - `update_user_store_memberships_updated_at` (tgenabled O) — preexistente
- `pg_proc` de `public.sec026_membership_audit_fn()`:
  - `prosecdef = true` (SECURITY DEFINER, imprescindible por la policy INSERT de audit_logs)
  - `proconfig = ['search_path=public, pg_temp']` (anti search-path injection)
  - ACL tras el REVOKE: EXECUTE solo para `postgres` (dueño) y `service_role`;
    `PUBLIC`, `anon` y `authenticated` sin EXECUTE.

## 5. Verificación funcional en producción (paso 4, autorizada)

Suite adaptada de `supabase/tests/membership_audit_test.sql` (copia reproducible en
`audit-evidence/CP-SEC-026/produccion/verificacion_funcional_produccion.sql`), ejecutada en
**una transacción única con ROLLBACK final** (no deja datos):

- **T1.2-a…j: TODOS PASARON en CostproBD** (ningún `TEST_FAILED`; la suite solo puede
  terminar sin error si todas las aserciones son verdaderas):
  - a INSERT → 1 `membership_grant` con actor autenticado, store_id, new_data y target_user_id correctos.
  - b UPDATE rol → 1 `membership_update` con `changed_fields.role.new='manager'`.
  - c UPDATE sin cambio real → 0 eventos.
  - d status→'revoked' → 1 `membership_revoke` lógico con estado previo registrado.
  - e DELETE → 1 `membership_revoke` con `old_data` de la fila eliminada.
  - f INSERT/UPDATE/DELETE en `products` → 0 eventos de membresías.
  - g claims service_role → `user_id` NULL y `actor_kind='service_role'`.
  - h sin JWT → `actor_kind='sql_directo'` y `db_role` registrado.
  - i fallo forzado del INSERT de auditoría → el alta de la membresía FALLA (fail-closed D1.4);
    retirado el fallo, el camino normal vuelve a auditar.
  - j vía RPC `manage_user_memberships` (SECURITY DEFINER admin) → el grant quedó auditado.
- Eventos generados por la suite antes del ROLLBACK: 6 `membership_grant`,
  4 `membership_revoke`, 1 `membership_update` (coherente con los escenarios).
- **T1.2-k NO ejecutable en producción**: usa `e2e_hard_delete_user`, función EXCLUSIVA de
  CostproE2E (así lo declara la cabecera de la suite original). Ese escenario permanece
  verificado en CostproE2E (11/11). Nota honesta: el primer intento ejecutó la suite original
  completa y falló exactamente ahí (42883 function not found) — sin dejar datos (ROLLBACK).

## 6. No-persistencia (post-ROLLBACK, medido)

| Métrica | Antes | Después |
|---|---|---|
| Membresías vivas | 11 | **11** |
| Eventos de membresías en audit_logs | 0 | **0** |
| audit_logs total | 10 498 | **10 498** |
| Usuarios/tenants/stores fixture (`026@fixture.local`, `T026_*`) | 0 | **0** |

**ROLLBACK LIMPIO: SÍ** — producción quedó en el estado exacto previo a la prueba; solo
cambiaron los objetos de esquema de la migración (trigger + función).

## 7. Estado final del ciclo CP-SEC-026

- [x] RESUELTA EN CÓDIGO (PR #1543, merge `6cbe9d8604d5`)
- [x] **APLICADA EN PRODUCCIÓN (2026-11-04, esta evidencia)**
- [x] **VERIFICACIÓN FUNCIONAL EN PRODUCCIÓN: A–J PASARON** (k exclusiva CostproE2E)
- [ ] Eventos reales en producción: se generarán con la próxima operación real de
      membresías (el trigger es pasivo; no se fabricaron datos para demostrarlo).

## 8. Rollback (sin cambios respecto del diseño)

```sql
DROP TRIGGER IF EXISTS trg_sec026_membership_audit ON public.user_store_memberships;
DROP FUNCTION IF EXISTS public.sec026_membership_audit_fn();
```

`audit_logs` no se toca; las filas del trigger son historial (purgables filtrando
`metadata->>'source' = 'cp_sec_026_trigger'` si el propietario lo decide).
