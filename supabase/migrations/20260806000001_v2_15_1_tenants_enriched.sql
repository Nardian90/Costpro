-- ============================================================================
-- Migration: 20260806000001_v2_15_1_tenants_enriched.sql
-- Iteración 13 — Soft Multi-Tenant
-- ============================================================================
-- Enriquece la tabla tenants con owner_id, plan, subscription_status,
-- stripe_customer_id, custom_domain, branding, is_active, trial_ends_at.
--
-- UP: ALTER TABLE ADD columns + indexes + RLS
-- DOWN: DROP columns + indexes + RLS
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan plan_t NOT NULL DEFAULT 'free'::plan_t,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'free')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx
  ON public.tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_idx
  ON public.tenants (custom_domain) WHERE custom_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenants_owner_id_idx ON public.tenants (owner_id);

-- RLS policies for tenants (tenant_admin can see/edit their own tenant)
DROP POLICY IF EXISTS "tenants_select_own_or_admin" ON public.tenants;
CREATE POLICY "tenants_select_own_or_admin" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "tenants_update_own_or_admin" ON public.tenants;
CREATE POLICY "tenants_update_own_or_admin" ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "tenants_insert_admin_only" ON public.tenants;
CREATE POLICY "tenants_insert_admin_only" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Keep existing tenants_admin_manage for DELETE (admin only)
-- but restrict to global admin only
DROP POLICY IF EXISTS "tenants_admin_manage" ON public.tenants;
CREATE POLICY "tenants_delete_admin_only" ON public.tenants
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.tenants IS
  'Iteración 13: Tenants enriched with owner_id, plan, subscription_status, stripe_customer_id, custom_domain, branding, is_active, trial_ends_at.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "tenants_delete_admin_only" ON public.tenants;
-- DROP POLICY IF EXISTS "tenants_insert_admin_only" ON public.tenants;
-- DROP POLICY IF EXISTS "tenants_update_own_or_admin" ON public.tenants;
-- DROP POLICY IF EXISTS "tenants_select_own_or_admin" ON public.tenants;
-- DROP INDEX IF EXISTS public.tenants_owner_id_idx;
-- DROP INDEX IF EXISTS public.tenants_custom_domain_idx;
-- DROP INDEX IF EXISTS public.tenants_stripe_customer_id_idx;
-- ALTER TABLE public.tenants
--   DROP COLUMN IF EXISTS trial_ends_at,
--   DROP COLUMN IF EXISTS is_active,
--   DROP COLUMN IF EXISTS branding,
--   DROP COLUMN IF EXISTS custom_domain,
--   DROP COLUMN IF EXISTS stripe_customer_id,
--   DROP COLUMN IF EXISTS subscription_status,
--   DROP COLUMN IF EXISTS plan,
--   DROP COLUMN IF EXISTS owner_id;
-- ============================================================================
