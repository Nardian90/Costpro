-- ═══════════════════════════════════════════════════════════════════════════
-- CP-POST-MERGE-EXECUTION-002 · FIX CI (2026-11-14)
-- RLS en la tabla de auditoría del costo nominal (SQL Security Gate)
-- ═══════════════════════════════════════════════════════════════════════════
-- El SQL Security Gate exige RLS habilitado en TODAS las tablas del esquema
-- público. La tabla de auditoría cp_cost_nominal_20261114_audit (creada por
-- 20261114190000, ya aplicada e inmutable) tenía REVOKE a anon/authenticated
-- pero RLS deshabilitado → hallazgo tables_no_rls.
--
-- FIX: ENABLE ROW LEVEL SECURITY SIN políticas → deny-all para todo rol que
-- no sea dueño de la tabla (fail-closed): anon/authenticated no ven nada ni
-- por GRANT residual ni por RLS; postgres (dueño) y service_role (BYPASSRLS)
-- conservan la lectura para la trazabilidad de la misión. Es la postura más
-- restrictiva posible para una tabla de auditoría interna.
-- Idempotente: ENABLE es re-ejecutable sin efecto.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cp_cost_nominal_20261114_audit enable row level security;

do $$
declare
    v_rls text;
begin
    select relrowsecurity::text into v_rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'cp_cost_nominal_20261114_audit';
    if v_rls <> 'true' then
        raise exception 'CP-POST-MERGE-002: RLS sigue deshabilitado en cp_cost_nominal_20261114_audit';
    end if;
    raise notice 'CP-POST-MERGE-002: RLS habilitado (deny-all sin políticas; lectura solo owner/service_role)';
end
$$;
