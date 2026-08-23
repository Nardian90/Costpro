-- ============================================================================
-- Migration: 20260824000003_telegram_interval_minutes.sql
-- ============================================================================
-- Purpose: Rename auto_publish_interval_hours → auto_publish_interval_minutes
--         and backfill existing values (1h→60min, 2h→120min, etc.).
--
-- After this migration, the internal model works exclusively in MINUTES.
-- The UI exposes predefined options (5, 10, 15, 30, 45, 60, 90, 120, 180,
-- 240, 360, 720, 1440) plus a "Custom" numeric input.
--
-- Validation (CHECK constraint):
--   • Integer
--   • >= 5  (minimum supported interval — below this is abusive)
--   • <= 10080 (7 days — maximum reasonable window)
--
-- NOTES:
--   • PostgreSQL supports RENAME COLUMN (atomic, keeps all data + constraints).
--   • We then ALTER the type to keep it integer, and add the CHECK constraint.
--   • Existing values in hours are multiplied by 60 to convert to minutes.
--   • The check is added AFTER the backfill so existing rows satisfy it.
-- ============================================================================

-- 1. Rename column (atomic — preserves all data and most constraints)
ALTER TABLE public.telegram_configs
  RENAME COLUMN auto_publish_interval_hours TO auto_publish_interval_minutes;

-- 2. Convert existing values from hours → minutes (60 min per hour)
--    NULL or default stays as default (we set 360 = 6h below).
UPDATE public.telegram_configs
  SET auto_publish_interval_minutes = COALESCE(auto_publish_interval_minutes, 6) * 60
  WHERE auto_publish_interval_minutes IS NOT NULL;

-- 3. Set default + add CHECK constraint
ALTER TABLE public.telegram_configs
  ALTER COLUMN auto_publish_interval_minutes SET DEFAULT 360,
  ALTER COLUMN auto_publish_interval_minutes SET NOT NULL,
  ADD CONSTRAINT telegram_configs_interval_minutes_check
    CHECK (auto_publish_interval_minutes >= 5 AND auto_publish_interval_minutes <= 10080);

-- 4. Backfill any NULLs (shouldn't happen after step 2, but be safe)
UPDATE public.telegram_configs
  SET auto_publish_interval_minutes = 360
  WHERE auto_publish_interval_minutes IS NULL;

COMMENT ON COLUMN telegram_configs.auto_publish_interval_minutes IS
  'Auto-publish interval in MINUTES. Range: 5 (minimum) to 10080 (7 days). 60=1h, 360=6h, 1440=24h.';
