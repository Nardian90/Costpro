-- Migration to create RSS tables and RLS policies
-- Version: 1.0.1
-- Updated at: 2026-02-25

-- 1. Create rss_feeds table
CREATE TABLE IF NOT EXISTS public.rss_feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create rss_settings table (Fixed: id as UUID for compatibility)
CREATE TABLE IF NOT EXISTS public.rss_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    priority_keywords TEXT[] DEFAULT ARRAY['Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria'],
    cache_duration_minutes INTEGER DEFAULT 60,
    apply_filter BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_settings ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for rss_feeds
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rss_feeds' AND policyname = 'Feeds are viewable by authenticated users') THEN
        CREATE POLICY "Feeds are viewable by authenticated users" ON public.rss_feeds FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rss_feeds' AND policyname = 'Admins can manage feeds') THEN
        CREATE POLICY "Admins can manage feeds" ON public.rss_feeds FOR ALL TO authenticated USING (public.has_role('admin'));
    END IF;
END $$;

-- 5. Create RLS Policies for rss_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rss_settings' AND policyname = 'Settings are viewable by authenticated users') THEN
        CREATE POLICY "Settings are viewable by authenticated users" ON public.rss_settings FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rss_settings' AND policyname = 'Admins can manage settings') THEN
        CREATE POLICY "Admins can manage settings" ON public.rss_settings FOR ALL TO authenticated USING (public.has_role('admin'));
    END IF;
END $$;

-- 6. Seed initial data
INSERT INTO public.rss_feeds (name, url)
VALUES ('Banco Central de Cuba', 'https://www.bc.gob.cu/rss.xml')
ON CONFLICT (url) DO NOTHING;

INSERT INTO public.rss_settings (id, priority_keywords, apply_filter)
VALUES ('00000000-0000-0000-0000-000000000000', ARRAY['Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria', 'Economía', 'Aranceles'], false)
ON CONFLICT (id) DO NOTHING;
