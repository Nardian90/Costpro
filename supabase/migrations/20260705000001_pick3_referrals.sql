-- ============================================================================
-- SPRINT 5 — Growth Engine: Pick 3 Referrals
-- ============================================================================
-- Tabla para el sistema de referidos:
--   - pick3_referrals: tracking de códigos de referido y conversiones
--
-- Fecha: 2026-07-05
-- Author: CostPro Sprint 5
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pick3_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'registered', 'converted', 'expired', 'rewarded')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),

  -- Recompensas (JSONB)
  referrer_reward JSONB,
  referred_reward JSONB,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pick3_referrals_referrer_user_id
  ON public.pick3_referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_pick3_referrals_referral_code
  ON public.pick3_referrals (referral_code);
CREATE INDEX IF NOT EXISTS idx_pick3_referrals_referred_user_id
  ON public.pick3_referrals (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_pick3_referrals_status
  ON public.pick3_referrals (status);
CREATE INDEX IF NOT EXISTS idx_pick3_referrals_expires_at
  ON public.pick3_referrals (expires_at);

-- RLS
ALTER TABLE public.pick3_referrals ENABLE ROW LEVEL SECURITY;

-- Políticas
-- Un usuario puede ver sus propios referrals (como referrer o referred)
DROP POLICY IF EXISTS "Users can view own referrals" ON public.pick3_referrals;
CREATE POLICY "Users can view own referrals"
  ON public.pick3_referrals FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- Un usuario puede crear su propio referral link
DROP POLICY IF EXISTS "Users can create own referrals" ON public.pick3_referrals;
CREATE POLICY "Users can create own referrals"
  ON public.pick3_referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_user_id);

-- Un usuario puede actualizar sus propios referrals
DROP POLICY IF EXISTS "Users can update own referrals" ON public.pick3_referrals;
CREATE POLICY "Users can update own referrals"
  ON public.pick3_referrals FOR UPDATE
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id)
  WITH CHECK (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trigger_pick3_referrals_updated_at
  ON public.pick3_referrals;
CREATE TRIGGER trigger_pick3_referrals_updated_at
  BEFORE UPDATE ON public.pick3_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.pick3_referrals IS
  'Pick 3 Intelligence referral program. Referrer gets 1 month free Player ($19), referred gets trial extension.';
