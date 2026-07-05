-- ============================================================================
-- Wallet Digital — Hardening de RLS (DELETE policies, WITH CHECK, admin access)
-- ============================================================================
-- Esta migración corrige los hallazgos de la auditoría de seguridad:
-- 1. Agrega WITH CHECK a las policies UPDATE (impide cambiar user_id)
-- 2. Crea policies DELETE faltantes
-- 3. Permite que admins (role='admin' en profiles) vean todas las billeteras
--    para soporte/auditoría — pero SOLO lectura (SELECT), no escritura
-- ============================================================================

-- ============================================================================
-- 1. wallet_accounts: agregar WITH CHECK a UPDATE + crear DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Users can update own wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Users can update own wallet accounts"
  ON public.wallet_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Users can delete own wallet accounts"
  ON public.wallet_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Admin: SELECT (lectura para soporte/auditoría)
DROP POLICY IF EXISTS "Admins can view all wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Admins can view all wallet accounts"
  ON public.wallet_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================================
-- 2. wallet_transactions: agregar WITH CHECK a UPDATE + crear DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Users can update own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can update own wallet transactions"
  ON public.wallet_transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can delete own wallet transactions"
  ON public.wallet_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Admin: SELECT (lectura para soporte/auditoría)
DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================================
-- 3. Índice para acelerar el check de admin (subquery en policies)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON public.profiles(id, role);

COMMENT ON POLICY "Admins can view all wallet accounts" ON public.wallet_accounts IS 'Admins (role=admin en profiles) pueden ver todas las billeteras para soporte/auditoría — solo SELECT, no escritura';
COMMENT ON POLICY "Admins can view all wallet transactions" ON public.wallet_transactions IS 'Admins (role=admin en profiles) pueden ver todas las transacciones para soporte/auditoría — solo SELECT, no escritura';
