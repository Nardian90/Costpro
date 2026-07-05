-- ============================================================================
-- SPRINT 4 — Monetización: Pick 3 Subscriptions & Usage Tracking
-- ============================================================================
-- Crea las tablas necesarias para el sistema de suscripciones:
--   - pick3_subscriptions: suscripciones de usuarios (Free/Player/Quant/Desk)
--   - pick3_usage: tracking mensual de usage (queries IA, backtests, API calls)
--
-- Fecha: 2026-07-05
-- Author: CostPro Sprint 4
-- ============================================================================

-- ============================================================================
-- Tabla: pick3_subscriptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pick3_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'player', 'quant', 'desk')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'paused')),

  -- Período actual
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),

  -- Trial
  trial_end TIMESTAMPTZ,

  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,

  -- Cancelación
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una suscripción activa por usuario
  CONSTRAINT one_active_subscription_per_user EXCLUDE (user_id WITH =)
    WHERE (status IN ('active', 'trialing', 'past_due'))
);

-- ============================================================================
-- Tabla: pick3_usage
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pick3_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- formato YYYY-MM

  -- Contadores
  ai_queries_count INTEGER NOT NULL DEFAULT 0,
  backtests_count INTEGER NOT NULL DEFAULT 0,
  api_calls_count INTEGER NOT NULL DEFAULT 0,

  -- Snapshot de límites al inicio del período
  ai_queries_limit INTEGER NOT NULL DEFAULT 3,
  backtests_limit INTEGER NOT NULL DEFAULT 90,

  -- Último reset
  last_reset TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un registro por usuario por período
  UNIQUE (user_id, period)
);

-- ============================================================================
-- Índices
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pick3_subscriptions_user_id
  ON public.pick3_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_pick3_subscriptions_status
  ON public.pick3_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_pick3_subscriptions_tier
  ON public.pick3_subscriptions (tier);

CREATE INDEX IF NOT EXISTS idx_pick3_subscriptions_period_end
  ON public.pick3_subscriptions (current_period_end);

CREATE INDEX IF NOT EXISTS idx_pick3_usage_user_id
  ON public.pick3_usage (user_id);

CREATE INDEX IF NOT EXISTS idx_pick3_usage_period
  ON public.pick3_usage (period);

CREATE INDEX IF NOT EXISTS idx_pick3_usage_user_period
  ON public.pick3_usage (user_id, period);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.pick3_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick3_usage ENABLE ROW LEVEL SECURITY;

-- Políticas para pick3_subscriptions
-- Un usuario solo puede ver/modificar su propia suscripción
DROP POLICY IF EXISTS "Users can view own subscription" ON public.pick3_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.pick3_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscription" ON public.pick3_subscriptions;
CREATE POLICY "Users can insert own subscription"
  ON public.pick3_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription" ON public.pick3_subscriptions;
CREATE POLICY "Users can update own subscription"
  ON public.pick3_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Políticas para pick3_usage
DROP POLICY IF EXISTS "Users can view own usage" ON public.pick3_usage;
CREATE POLICY "Users can view own usage"
  ON public.pick3_usage FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own usage" ON public.pick3_usage;
CREATE POLICY "Users can insert own usage"
  ON public.pick3_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own usage" ON public.pick3_usage;
CREATE POLICY "Users can update own usage"
  ON public.pick3_usage FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Trigger para updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pick3_subscriptions_updated_at
  ON public.pick3_subscriptions;
CREATE TRIGGER trigger_pick3_subscriptions_updated_at
  BEFORE UPDATE ON public.pick3_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_pick3_usage_updated_at
  ON public.pick3_usage;
CREATE TRIGGER trigger_pick3_usage_updated_at
  BEFORE UPDATE ON public.pick3_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Comentario
-- ============================================================================
COMMENT ON TABLE public.pick3_subscriptions IS
  'Pick 3 Intelligence subscriptions. Tiers: free ($0), player ($19), quant ($49), desk ($149). Trial 14 días.';

COMMENT ON TABLE public.pick3_usage IS
  'Pick 3 Intelligence monthly usage tracking. Resets each month. Limits by tier.';
