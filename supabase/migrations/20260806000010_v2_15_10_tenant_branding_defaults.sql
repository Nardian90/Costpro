-- ============================================================================
-- Migration: 20260806000010_v2_15_10_tenant_branding_defaults.sql
-- Iteración 13 — Set default branding for existing tenants
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Set default branding for existing tenants
UPDATE public.tenants
  SET branding = jsonb_build_object(
    'logo_url', NULL,
    'primary_color', '#0ea5e9',
    'secondary_color', '#64748b',
    'font_family', 'Inter'
  )
  WHERE branding = '{}'::jsonb OR branding IS NULL;

-- Set trial_ends_at for existing active tenants (30 days from now)
UPDATE public.tenants
  SET trial_ends_at = now() + interval '30 days'
  WHERE trial_ends_at IS NULL AND subscription_status = 'trial';

COMMENT ON COLUMN public.tenants.branding IS
  'Iteración 13: JSONB with logo_url, primary_color, secondary_color, font_family.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- UPDATE public.tenants SET branding = '{}'::jsonb WHERE branding IS NOT NULL;
-- UPDATE public.tenants SET trial_ends_at = NULL WHERE subscription_status = 'trial';
-- ============================================================================
