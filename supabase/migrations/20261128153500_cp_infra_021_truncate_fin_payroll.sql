-- ============================================================================
-- Migration: 20261128153500_cp_infra_021_truncate_fin_payroll.sql
-- Misión:    CP-FIN-REM-001 — PR-A TR (freno de TRUNCATE para libro y nóminas)
-- Fecha:     2026-11-28
-- ============================================================================
-- TR — El freno CP-INFRA-020 cubría 34 tablas y NINGUNA de las fin_* ni de
--      nóminas (revalidado en vivo 2026-11-28: 34 triggers block_truncate,
--      0 sobre fin/payroll; service_role conserva TRUNCATE sobre
--      fin_movements por grants de plataforma).
--
-- Extensión: instala el MISMO freno (block_truncate + parámetro
-- costpro.allow_truncate + ENABLE ALWAYS) sobre las 16 tablas del libro y de
-- nóminas, reutilizando el instalador idempotente y fail-closed
-- cp_infra_020_install_breaker(text[]): si falta CUALQUIERA de las 16, ABORTA
-- sin instalar nada.
--
-- Decisiones documentadas:
--   · NO se revoca TRUNCATE a service_role: los grants vienen del
--     aprovisionamiento de plataforma (ALL a service_role) y no se puede
--     demostrar que NINGÚN flujo (interna de Supabase, cron futuro,
--     herramientas del propietario) lo use; el FRENO es la única barrera
--     (misión 5.4: "si no, deja el freno como única barrera y documéntalo").
--   · ENABLE ALWAYS no protege del superusuario ni del dueño de la tabla
--     (postgres) con session_replication_role=replica; y menos aún si el
--     bypass se fija a mano. Es un freno anti-borrado-masivo accidental,
--     no un candado criptográfico.
--   · 12 tablas fin_* + 4 de nóminas (payroll_item_concepts, payroll_items,
--     payrolls, worker_salary_rates).
--
-- Rollback: supabase/rollbacks/20261128153500_rollback_cp_infra_021.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_instaladas int;
  v_tablas text[] := array[
    'fin_account_mapping', 'fin_categories', 'fin_document_types', 'fin_entries',
    'fin_metric_catalog', 'fin_movements', 'fin_opening_balances', 'fin_posting_errors',
    'fin_posting_generations', 'fin_reconciliation_config', 'fin_reconciliation_snapshots',
    'fin_rule_versions',
    'payroll_item_concepts', 'payroll_items', 'payrolls', 'worker_salary_rates'
  ];
begin
  if to_regprocedure('public.cp_infra_020_install_breaker(text[])') is null then
    raise exception 'CP-INFRA-021 PRECOND: instalador cp_infra_020_install_breaker(text[]) ausente'
      using errcode = 'P0001';
  end if;
  v_instaladas := public.cp_infra_020_install_breaker(v_tablas);
  if v_instaladas <> 16 then
    raise exception 'CP-INFRA-021 PRECOND: esperadas 16 tablas protegidas, instaladas %', v_instaladas
      using errcode = 'P0001';
  end if;
  raise notice 'CP-INFRA-021: % triggers de freno instalados con ENABLE ALWAYS', v_instaladas;
end $$;

-- Verificación fail-closed: exactamente 16 triggers nuevos, todos tgenabled='A'
do $$
declare
  v_n int; v_a int;
begin
  select count(*), count(*) filter (where t.tgenabled = 'A')
    into v_n, v_a
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and p.proname = 'block_truncate'
     and c.relname in ('fin_account_mapping','fin_categories','fin_document_types',
        'fin_entries','fin_metric_catalog','fin_movements','fin_opening_balances',
        'fin_posting_errors','fin_posting_generations','fin_reconciliation_config',
        'fin_reconciliation_snapshots','fin_rule_versions','payroll_item_concepts',
        'payroll_items','payrolls','worker_salary_rates');
  if v_n <> 16 or v_a <> 16 then
    raise exception 'CP-INFRA-021 POSTCHECK: esperados 16/16 triggers ENABLE ALWAYS, encontrados %/%', v_n, v_a
      using errcode = 'P0001';
  end if;
  raise notice 'CP-INFRA-021 POSTCHECK OK: 16/16 triggers ENABLE ALWAYS';
end $$;

COMMIT;
