# SEC-026 — Auditoría de membresías (quién otorgó o revocó un acceso a tienda)

Tarea: CP-SEC-026 · PR: `feat/cp-sec-026-auditoria-membresias` · Fecha: 2026-11-03
Evidencia: `audit-evidence/CP-SEC-026/EVIDENCIA.md` · Producción: `audit-evidence/CP-SEC-026/EVIDENCIA_PRODUCCION.md`
Estado (regla 10 de la misión): **APLICADA Y VERIFICADA EN PRODUCCIÓN (2026-11-04)**
(compuerta T1 ejecutada el 2026-11-04 con autorización expresa del propietario emitida en
la sesión de cierre: «si falta alguna autorización yo lo autorizo… cierra el ciclo»;
verificación funcional A–J en verde en CostproBD, escenario k exclusivo de CostproE2E).

## 1. Problema

Las altas, cambios y bajas en `public.user_store_memberships` no dejaban ningún registro
en `public.audit_logs`: nadie puede responder "¿quién dio acceso a quién, cuándo y con qué
rol?". Las RPC de aplicación (`managed_update_membership`, `managed_revoke_membership`)
escriben en `public.user_audit_log`, pero esa vía no cubre INSERT/DELETE directos, las
operaciones vía `service_role` (rutas de API), ni los borrados en cascada. La evidencia
previa lo confirma: 7 (hoy 10) membresías y **0 eventos** de membresías en `audit_logs`.

## 2. Diseño (decisiones D1.1–D1.6)

**Mecanismo (D1.1)** — trigger de base de datos
`trg_sec026_membership_audit` (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW) sobre
`public.user_store_memberships`, ejecuta `public.sec026_membership_audit_fn()`. Vive en la
tabla, así que atrapa TODAS las vías: RPC, SQL directo, service_role y cascadas de FK. No
se instrumentó solo la capa de aplicación.

**Acciones (D1.2)** — el `membership_status` real es `{active, revoked}`:
- `membership_grant` — INSERT.
- `membership_update` — UPDATE que cambia realmente `user_id`, `store_id`, `role` o
  `status`. Los UPDATE sin cambio real no generan evento (comparación campo a campo;
  `updated_at` no cuenta porque lo toca el trigger `update_updated_at_column`).
- `membership_revoke` — DELETE real, o borrado LÓGICO: UPDATE cuyo `status` pasa a
  `revoked` (así revocan `managed_revoke_membership` y `manage_user_memberships`).

**Contenido del evento (D1.3)** — mapeado al esquema REAL de `audit_logs` (leído antes de
diseñar): `user_id` = actor (`auth.uid()`); si es NULL, `metadata.actor_kind` lleva la
etiqueta explícita `service_role` o `sql_directo` (nunca vacío) y `metadata.db_role` el rol
de BD ejecutor; `table_name` = `user_store_memberships`; `record_id` = id de la membresía;
`store_id` = tienda; `old_data`/`new_data` = fila antes/después (`to_jsonb`); `metadata`
incluye `target_user_id` y `changed_fields` (UPDATE). Sin PII adicional: la tabla de
membresías solo guarda UUIDs y enums, nunca emails ni nombres.

**Fail-closed (D1.4)** — la función no captura excepciones: si el INSERT en `audit_logs`
falla, la operación sobre la membresía falla con él (mismo hilo transaccional). El camino
normal no puede fallar por permisos/RLS/ACL: la función es SECURITY DEFINER (dueño
`postgres`, dueño también de `audit_logs`, FORCE RLS verificado OFF en el guard), de modo
que el INSERT de auditoría no depende de los grants ni de las policies del rol invocante.
Los grants de `audit_logs` para anon/authenticated (REVOKE de UPDATE/DELETE/TRUNCATE,
commit e2e2a19) quedan intactos.

**Seguridad de la función (D1.5)** — SECURITY DEFINER es aquí imprescindible: la policy
INSERT de `audit_logs` (`audit_logs_insert_authenticated`) exige `user_id = auth.uid()`, y
en contexto service_role/SQL directo el actor es NULL (la operación legítima fallaría).
Mitigaciones: `SET search_path = public, pg_temp`; `REVOKE EXECUTE ... FROM PUBLIC, anon,
authenticated` (una función de trigger no es invocable por clientes — PostgreSQL solo la
ejecuta vía trigger, y los checks 1 y 2 de `scripts/ci-gate-sql-checks.js` ya excluyen
funciones disparadoras por esa razón, nota CP-ORG-001 c5); sin recursión (los únicos
triggers de `audit_logs` son BEFORE INSERT/UPDATE que no tocan membresías). El gate de CI
pasa SIN ampliar el allowlist (regla 7): verificado en vivo contra CostproE2E (0 hallazgos)
y con el test estático (CONTRATO OK).

**Interacciones (D1.6)** — probadas contra CostproE2E: `manage_user_memberships`
(DELETE+INSERT/UPSERT → revoke + grant), `managed_update_membership` (UPDATE → update o
revoke lógico), `managed_revoke_membership` (UPDATE status='revoked' → revoke), y el flujo
de limpieza de usuarios (`e2e_hard_delete_user`, D1.6/DT-06) que borra las membresías del
usuario: cada fila borrada deja su `membership_revoke` con el usuario destino en
`metadata.target_user_id`. Las FK de `user_store_memberships` son ON DELETE CASCADE
(profiles/stores), así que todo borrado en cascada deja rastro.

**Guard fail-closed de la migración (T1.1)** — aborta (RAISE EXCEPTION, sin cambios) si:
no existe `user_store_memberships` o `audit_logs`; faltan las columnas esperadas; el enum
`membership_status` no distingue active/revoked; o `audit_logs` tiene FORCE RLS (el definer
quedaría sujeto a RLS sin policy y toda operación de membresía fallaría). Idempotente
(CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

## 3. Pruebas (T1.2)

`supabase/tests/membership_audit_test.sql` — suite transaccional (BEGIN/ROLLBACK, cero
residuos) con 11 escenarios, ejecutada en CostproE2E con resultado OK. Cubre: 1 evento por
INSERT; 1 por UPDATE con cambio; 0 por UPDATE sin cambio real; revoke lógico (status→
revoked); revoke por DELETE con old_data; 0 eventos por operaciones en otras tablas
(products); etiquetas de actor (authenticated / service_role / sql_directo); fallo forzado
del INSERT de auditoría → la operación de membresía FALLA y se recupera tras retirarlo;
vía RPC `manage_user_memberships` auditada; limpieza de usuario deja rastro.

## 4. Aplicación y rollback

**Compuerta T1 (producción)** — solo con la frase literal `AUTORIZO SEC-026 PROD`
(✅ EJECUTADA el 2026-11-04 — ver `audit-evidence/CP-SEC-026/EVIDENCIA_PRODUCCION.md`):
1. Identidad de CostproBD (nombre y ref) + estado previo medido (hoy: 10 membresías,
   0 eventos — revalidar en el momento de la aplicación, regla 11).
2. Aplicar `supabase/migrations/20261103000001_cp_sec_026_membership_audit_trigger.sql`
   (idéntica a la probada en CostproE2E, guard fail-closed incluido).
3. Comprobación posterior por catálogo:
   ```sql
   SELECT tgname FROM pg_trigger
   WHERE tgrelid='public.user_store_memberships'::regclass AND NOT tgisinternal;
   -- debe incluir trg_sec026_membership_audit
   SELECT prosecdef, proacl::text FROM pg_proc
   WHERE oid='public.sec026_membership_audit_fn()'::regprocedure;
   -- prosecdef = true; EXECUTE solo para el dueño
   ```
4. La prueba funcional con una membresía de control SOLO si el propietario lo permite
   expresamente; si no, limitar la verificación a catálogo y a CostproE2E.
5. Registrar en `audit-evidence/CP-SEC-026/` fecha, mecanismo, resultado y comprobación
   posterior (regla 11: `schema_migrations` de producción no refleja lo aplicado).

**Rollback** (documentado también en la cabecera de la migración):
```sql
DROP TRIGGER IF EXISTS trg_sec026_membership_audit ON public.user_store_memberships;
DROP FUNCTION IF EXISTS public.sec026_membership_audit_fn();
```
No destructivo: `audit_logs` no se toca; sus filas del trigger son historial que se
conserva (purgable con `metadata->>'source' = 'cp_sec_026_trigger'` si el propietario
lo decide).

## 5. Consultas para investigar "quién dio acceso a quién" (sin PII en el repo)

```sql
-- Historial completo de una membresía (por id):
SELECT created_at, action, user_id AS actor, metadata->>'actor_kind' AS via,
       old_data->>'role' AS rol_antes, new_data->>'role' AS rol_despues,
       old_data->>'status' AS estado_antes, new_data->>'status' AS estado_despues
FROM public.audit_logs
WHERE table_name='user_store_memberships' AND record_id = <membership_id>
ORDER BY created_at;

-- Quién otorgó/revocó accesos de un usuario (por su id de usuario destino):
SELECT a.created_at, a.action, a.user_id AS actor, a.store_id,
       a.new_data->>'role' AS rol, a.metadata->>'actor_kind' AS via
FROM public.audit_logs a
WHERE a.table_name='user_store_memberships'
  AND a.metadata->>'target_user_id' = <target_user_id>
ORDER BY a.created_at;

-- Auditoría por tienda (actividad de concesión en una tienda):
SELECT a.created_at, a.action, a.user_id AS actor,
       a.new_data->>'role' AS rol, a.metadata->>'actor_kind' AS via
FROM public.audit_logs a
WHERE a.table_name='user_store_memberships' AND a.store_id = <store_id>
ORDER BY a.created_at DESC
LIMIT 100;

-- Vías de concesión (¿cuánto se gestiona por RPC, app o SQL directo?):
SELECT metadata->>'actor_kind' AS via, action, count(*)
FROM public.audit_logs
WHERE table_name='user_store_memberships'
GROUP BY 1, 2 ORDER BY 3 DESC;
```
(Identidades de personas, si hiciera falta, se resuelven en producción con los UUIDs contra
`profiles`/`auth.users` en el momento de la investigación; este repo no guarda emails ni
nombres.)

## 6. Estado y pendientes

- RESUELTA EN CÓDIGO: migración + pruebas + integración con el gate, probadas en
  CostproE2E (11/11 escenarios OK; gate en vivo 0 hallazgos; contrato estático OK;
  suite vitest completa 5010 pruebas en verde; lint 0 errores).
- APLICADA EN PRODUCCIÓN (2026-11-04): compuerta T1 ejecutada con autorización
  expresa del propietario (sesión de cierre del ciclo del PR #1543). Migración aplicada
  byte a byte idéntica a la probada (sha256 594f9312…); catálogo: trigger activo
  (tgenabled O), SECURITY DEFINER con search_path fijado, EXECUTE solo dueño/service_role.
- VERIFICACIÓN FUNCIONAL EN PRODUCCIÓN: PASÓ (2026-11-04) — escenarios T1.2-a…j en
  verde contra CostproBD en transacción única con ROLLBACK (6 grants, 4 revokes, 1 update
  generados y revertidos; estado post-prueba idéntico al previo: 11 membresías, 0 eventos,
  10 498 filas de audit_logs, 0 fixtures). Escenario k (e2e_hard_delete_user) es exclusivo
  de CostproE2E y permanece verificado allí. Evidencia: `EVIDENCIA_PRODUCCION.md`.
- Próximos eventos reales: el trigger es pasivo; registrarán la próxima operación real
  de membresías (no se fabricaron datos para demostrarlo).
