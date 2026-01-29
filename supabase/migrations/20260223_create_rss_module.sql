-- Migration: Create RSS Module Tables
-- Date: 2026-02-23
-- Description: Adds tables for RSS feeds and settings with RLS policies and seed data.

BEGIN;

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.rss_feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rss_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority_keywords TEXT[] DEFAULT ARRAY['Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria'],
    cache_duration_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_settings ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for rss_feeds
-- Everyone authenticated can view active feeds
CREATE POLICY "rss_feeds_view_policy" ON public.rss_feeds
    FOR SELECT TO authenticated USING (true);

-- Only admin, manager, or encargado can manage feeds
CREATE POLICY "rss_feeds_manage_policy" ON public.rss_feeds
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role IN ('admin', 'manager', 'encargado'))
        )
    );

-- 4. RLS Policies for rss_settings
-- Everyone authenticated can view settings
CREATE POLICY "rss_settings_view_policy" ON public.rss_settings
    FOR SELECT TO authenticated USING (true);

-- Only admin, manager, or encargado can manage settings
CREATE POLICY "rss_settings_manage_policy" ON public.rss_settings
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role IN ('admin', 'manager', 'encargado'))
        )
    );

-- 5. Seed Data
INSERT INTO public.rss_feeds (url, name)
VALUES ('https://www.bc.gob.cu/rss.xml', 'Banco Central de Cuba')
ON CONFLICT (url) DO NOTHING;

-- Insert default settings if not exists
INSERT INTO public.rss_settings (priority_keywords)
SELECT ARRAY['Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria']
WHERE NOT EXISTS (SELECT 1 FROM public.rss_settings);

-- 6. Updated at Trigger (Generic function should exist)
-- Check if the function exists first
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
        CREATE TRIGGER set_updated_at_rss_feeds
            BEFORE UPDATE ON public.rss_feeds
            FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

        CREATE TRIGGER set_updated_at_rss_settings
            BEFORE UPDATE ON public.rss_settings
            FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

COMMIT;
