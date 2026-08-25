-- ============================================================================
-- Migration: 20260824000004_whatsapp_auto_publish.sql
-- ============================================================================
-- Purpose: Add WhatsApp product publishing infrastructure (parity with Telegram).
--   • whatsapp_configs: add auto-publish + content config columns
--   • whatsapp_product_posts: new history table (mirrors telegram_product_posts)
--
-- PARITY WITH TELEGRAM (migration 20260824000001 + 20260824000002):
--   - auto_publish_enabled           (boolean, default false)
--   - auto_publish_interval_minutes   (integer, default 360 = 6h, CHECK 5-10080)
--   - last_publish_at                (timestamptz, nullable)
--   - last_product_id                (uuid, nullable)
--   - last_publish_status            (text, nullable)
--   - last_publish_error              (text, nullable)
--   - show_price                     (text CHECK enum, default 'according_to_storefront')
--   - show_physical_units             (boolean, default false)
--
-- NOTE: WhatsApp uses Baileys (unofficial WhatsApp Web library) which has
-- different constraints than Telegram's official Bot API:
--   - Anti-ban rules apply (max 20 invitations/day, 9-21h Havana window)
--   - Product publishing uses sendMessage with caption (not sendPhoto)
--   - Session must be connected (no ephemeral token like Telegram)
-- ============================================================================

-- ═══ 1. Add auto-publish + content config columns to whatsapp_configs ═══
ALTER TABLE public.whatsapp_configs
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_publish_interval_minutes integer DEFAULT 360,
  ADD COLUMN IF NOT EXISTS last_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_product_id uuid,
  ADD COLUMN IF NOT EXISTS last_publish_status text,
  ADD COLUMN IF NOT EXISTS last_publish_error text,
  ADD COLUMN IF NOT EXISTS show_price text DEFAULT 'according_to_storefront'
    CHECK (show_price IN ('according_to_storefront', 'show', 'hide')),
  ADD COLUMN IF NOT EXISTS show_physical_units boolean DEFAULT false;

-- Backfill defaults for any existing rows
UPDATE public.whatsapp_configs
  SET auto_publish_interval_minutes = COALESCE(auto_publish_interval_minutes, 360),
      show_price = COALESCE(show_price, 'according_to_storefront'),
      show_physical_units = COALESCE(show_physical_units, false)
  WHERE auto_publish_interval_minutes IS NULL OR show_price IS NULL OR show_physical_units IS NULL;

-- Enforce NOT NULL + add CHECK constraint on interval (mirrors telegram_configs)
ALTER TABLE public.whatsapp_configs
  ALTER COLUMN auto_publish_interval_minutes SET DEFAULT 360,
  ALTER COLUMN auto_publish_interval_minutes SET NOT NULL,
  ADD CONSTRAINT whatsapp_configs_interval_minutes_check
    CHECK (auto_publish_interval_minutes >= 5 AND auto_publish_interval_minutes <= 10080);

COMMENT ON COLUMN whatsapp_configs.auto_publish_enabled IS 'Whether automatic WhatsApp product publishing is active for this store';
COMMENT ON COLUMN whatsapp_configs.auto_publish_interval_minutes IS 'Auto-publish interval in MINUTES. Range: 5 (minimum) to 10080 (7 days). 60=1h, 360=6h, 1440=24h.';
COMMENT ON COLUMN whatsapp_configs.last_publish_at IS 'Timestamp of last publish attempt (manual or auto)';
COMMENT ON COLUMN whatsapp_configs.last_product_id IS 'Product ID of the last published product (for rotation)';
COMMENT ON COLUMN whatsapp_configs.last_publish_status IS 'success | failed | no_products | no_session | anti_ban_blocked';
COMMENT ON COLUMN whatsapp_configs.last_publish_error IS 'Error message if last publish failed';
COMMENT ON COLUMN whatsapp_configs.show_price IS 'How WhatsApp publishes price: according_to_storefront (follow Vitrina), show (still respects Vitrina), hide (always)';
COMMENT ON COLUMN whatsapp_configs.show_physical_units IS 'Whether WhatsApp shows physical units. Even when true, respects stock_visible (Vitrina rules).';

-- ═══ 2. Create whatsapp_product_posts table (mirrors telegram_product_posts) ═══
CREATE TABLE IF NOT EXISTS public.whatsapp_product_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_price numeric,
  product_currency text,
  whatsapp_phone_number text,
  whatsapp_jid text,
  whatsapp_message_id text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  publish_type text NOT NULL DEFAULT 'manual',
  published_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_posts_store ON whatsapp_product_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_wa_posts_product ON whatsapp_product_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_wa_posts_store_created ON whatsapp_product_posts(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_posts_store_status ON whatsapp_product_posts(store_id, status);

ALTER TABLE public.whatsapp_product_posts ENABLE ROW LEVEL SECURITY;

-- Same RLS policies as telegram_product_posts (mirror exactly)
CREATE POLICY "Users can view own store whatsapp posts" ON whatsapp_product_posts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = whatsapp_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Users can manage own store whatsapp posts" ON whatsapp_product_posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = whatsapp_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = whatsapp_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

COMMENT ON TABLE public.whatsapp_product_posts IS 'History of product publications to WhatsApp — used for rotation, idempotency, and audit';
