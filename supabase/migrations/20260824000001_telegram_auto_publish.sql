-- ============================================================================
-- Migration: 20260824000001_telegram_auto_publish.sql
-- ============================================================================
-- Purpose: Add auto-publish configuration to telegram_configs + create
-- telegram_product_posts table for history/rotation tracking.
-- ============================================================================

-- ═══ 1. Add auto-publish columns to telegram_configs ═══
ALTER TABLE public.telegram_configs
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_publish_interval_hours integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS last_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_product_id uuid,
  ADD COLUMN IF NOT EXISTS last_publish_status text,
  ADD COLUMN IF NOT EXISTS last_publish_error text;

COMMENT ON COLUMN telegram_configs.auto_publish_enabled IS 'Whether automatic product publishing is active for this store';
COMMENT ON COLUMN telegram_configs.auto_publish_interval_hours IS 'Hours between auto publications (1,2,4,6,12,24)';
COMMENT ON COLUMN telegram_configs.last_publish_at IS 'Timestamp of last publish attempt (manual or auto)';
COMMENT ON COLUMN telegram_configs.last_product_id IS 'Product ID of the last published product (for rotation)';
COMMENT ON COLUMN telegram_configs.last_publish_status IS 'success | failed | no_products';
COMMENT ON COLUMN telegram_configs.last_publish_error IS 'Error message if last publish failed';

-- ═══ 2. Create telegram_product_posts table ═══
CREATE TABLE IF NOT EXISTS public.telegram_product_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_price numeric,
  product_currency text,
  telegram_chat_id bigint NOT NULL,
  telegram_message_id bigint,
  status text NOT NULL DEFAULT 'pending',
  error text,
  publish_type text NOT NULL DEFAULT 'manual',
  published_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_posts_store ON telegram_product_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_tg_posts_product ON telegram_product_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_tg_posts_store_created ON telegram_product_posts(store_id, created_at DESC);

ALTER TABLE public.telegram_product_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own store posts" ON telegram_product_posts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = telegram_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Users can manage own store posts" ON telegram_product_posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = telegram_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = telegram_product_posts.store_id AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

COMMENT ON TABLE public.telegram_product_posts IS 'History of product publications to Telegram — used for rotation and audit';
