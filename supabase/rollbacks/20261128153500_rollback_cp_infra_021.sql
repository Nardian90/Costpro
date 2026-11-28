-- ============================================================================
-- Rollback: 20261128153500_rollback_cp_infra_021.sql
-- Retira el freno de TRUNCATE de las 16 tablas fin_*/nómina (CP-INFRA-021)
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================
BEGIN;


DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_account_mapping;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_categories;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_document_types;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_entries;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_metric_catalog;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_movements;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_opening_balances;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_posting_errors;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_posting_generations;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_reconciliation_config;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_reconciliation_snapshots;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_rule_versions;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payroll_item_concepts;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payroll_items;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payrolls;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.worker_salary_rates;

COMMIT;
