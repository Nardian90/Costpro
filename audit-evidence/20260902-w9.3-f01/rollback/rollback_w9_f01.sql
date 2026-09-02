-- ═══════════════════════════════════════════════════════════════════════
-- W9-F01 ROLLBACK — Reversión exacta 1:1 al estado PRE (W9.3)
-- SOLO usar si una verificación POST falla o el usuario ordena revertir.
-- Restaura: ACL arwdDxtm de anon+authenticated en las 5 expuestas,
--           RLS OFF en las 6, elimina la policy f01_snapshot_restorer_access.
-- NO re-granta a service_role/postgres (nunca perdieron grants)
-- NO re-granta a PUBLIC (nunca tuvo grants).
-- Verificación de referencia: evidence/f01/pre/b2_rls_off_tables.json
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Restaurar ACL de las 5 tablas expuestas (estado PRE: ALL PRIVILEGES)
GRANT ALL PRIVILEGES ON TABLE public.store_credit_ledger     TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.wac_change_log          TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.w62_df04_design_params  TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.w62_df04_synthetic_rows TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.w62_zero_cost_flags     TO anon, authenticated;

-- 2) Desactivar RLS en las 5
ALTER TABLE public.store_credit_ledger     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wac_change_log          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_df04_design_params  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_df04_synthetic_rows DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_zero_cost_flags     DISABLE ROW LEVEL SECURITY;

-- 3) transaction_recovery_ledger: eliminar policy y desactivar RLS
DROP POLICY IF EXISTS f01_snapshot_restorer_access ON public.transaction_recovery_ledger;
ALTER TABLE public.transaction_recovery_ledger DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
