-- ============================================================================
-- CP-INFRA-011 — BOOTSTRAP EXCLUSIVO DE E2E (CostproE2E) — v3 (secciones)
-- ============================================================================
-- Propósito: preparar una base Supabase VACÍA y aislada para el pipeline E2E.
-- Este archivo NUNCA debe aplicarse en producción (wthkddeleylijmonclxg) y
-- NUNCA forma parte de supabase/migrations/ (el historial original queda
-- intacto). Lo aplica exclusivamente scripts/e2e/reset-remote-e2e-db.mjs.
--
-- ESTRUCTURA EN SECCIONES (procesadas por el apilador, no aplicadas a ciegas):
--   SECCION A — BOOTSTRAP MÍNIMO: extensiones + roles shim. La aplica
--     --bootstrap (idempotente) ANTES de cualquier otra cosa.
--   SECCION C — CENTINELA + INFRA POST-BASELINE: public.e2e_is_isolated_db()
--     y el trigger de alta de usuarios tr_on_auth_user_created (vive sobre
--     auth.users, schema NO cubierto por el snapshot public-only del
--     baseline). La aplica el apilador al FINAL de --apply-replay
--     (tras baseline + pre-tamo + tramo).
--
-- DESVIACIÓN DOCUMENTADA del mandato §3.3 (orden bootstrap→centinela→
-- migraciones): los guards de inventario del propio stream de migraciones
-- auditan la fidelidad EXACTA con producción — p. ej.
-- 20260902205210_w9_f06_h1 exige "total funciones public=481". El centinela
-- es +1 función en public y rompería todos esos guards (evidencia:
-- audit-evidence/INFRA-011/remote/apply-replay.json, 2026-10-22: 482≠481).
-- Por ello el centinela se instala tras completar el replay. La garantía de
-- aislamiento EN RUNTIME permanece íntegra: el guard e2e exige centinela=true
-- antes de CUALQUIER operación de tests, y --verify/--contract lo validan
-- en el estado final. (Durante el replay, el apilador mantiene identidad
-- verificada por ref + allowlist + Management API.)
-- ============================================================================

-- >>> SECCION A: BOOTSTRAP MÍNIMO (extensiones + roles) <<<

-- A.1 Extensiones requeridas por el stream (verificadas disponibles por catálogo)
create extension if not exists btree_gist;
create extension if not exists pg_cron;

-- A.2 Roles shim referenciados por el baseline y el tramo (inventario:
-- roles-inventory.json de RECOVERY-20260828 + migraciones 20260113/20260812).
-- postgres tiene CREATEROLE en el proyecto aislado (verificado read-only).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'warehouse_staff') then
    create role warehouse_staff nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'costpro_transaction_adjuster') then
    create role costpro_transaction_adjuster nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'costpro_snapshot_restorer') then
    create role costpro_snapshot_restorer nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then
    create role dashboard_user nologin;
  end if;
end $$;

-- A.3 Membresías shim (evidenciadas por el propio stream): las migraciones
-- 20260812000001, 20261004130003 y 20261014080000 ejecutan ALTER FUNCTION
-- ... OWNER TO costpro_transaction_adjuster, lo que exige que el rol
-- aplicador (postgres) sea MIEMBRO del rol destino — membresía que existió
-- en producción (las migraciones fueron aplicadas allí) y no está versionada
-- en ningún artefacto del repo. Se otorga aquí para reproducir la operación.
grant costpro_transaction_adjuster to postgres;

-- >>> SECCION C: CENTINELA (la instala el apilador al FINAL de --apply-replay) <<<

-- Sin SECURITY DEFINER deliberadamente: solo devuelve true (no toca tablas) y
-- los guards del tramo auditan las funciones SD ejecutables por anon.
create or replace function public.e2e_is_isolated_db()
returns boolean
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select true
$$;

comment on function public.e2e_is_isolated_db() is
  'CP-INFRA-011 centinela: true SOLO en la base E2E aislada (CostproE2E). Infraestructura exclusiva de E2E — nunca en producción. El guard e2e/fixtures/assert-isolated-db.ts exige true antes de cualquier operación E2E.';

grant execute on function public.e2e_is_isolated_db() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- C.2 — TRIGGER DE ALTA DE USUARIOS (fidelidad con producción)
-- ----------------------------------------------------------------------------
-- Hallazgo CICLO 2 (corrida 39777819072 del workflow aislado): el baseline
-- es un snapshot del esquema PUBLIC únicamente; el trigger de alta
-- tr_on_auth_user_created vive sobre auth.users (schema auth, NO cubierto
-- por el snapshot) y no está versionado en ningún artefacto del repo
-- (creado out-of-band, como el esquema core — inventario FASE 0). Sin él,
-- los usuarios creados vía Auth Admin API quedan SIN fila en
-- public.profiles y el provisioning de e2e/fixtures/run-env.ts muere en
-- el FK tenants_owner_id_fkey (23503) al crear el tenant del run.
--
-- La función public.on_auth_user_created() YA proviene del baseline
-- (schema public ✓, SECURITY DEFINER verificado en la base aislada).
-- Solo el trigger (auth.users) hay que materializar.
-- Definición replicada de producción (lectura read-only autorizada,
-- 2026-10-22):
--   CREATE TRIGGER tr_on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION on_auth_user_created()
-- Idempotente: drop + create.
drop trigger if exists tr_on_auth_user_created on auth.users;
create trigger tr_on_auth_user_created
  after insert on auth.users
  for each row execute function public.on_auth_user_created();
