
-- Migration: Create Reports Schema
-- Created at: 2026-02-20

-- Create report_definitions table
CREATE TABLE IF NOT EXISTS public.report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'sales', 'profit', 'inventory', 'kardex', 'purchases', 'audit'
    filters JSONB DEFAULT '{}'::jsonb,
    date_range JSONB DEFAULT '{}'::jsonb,
    columns JSONB DEFAULT '[]'::jsonb,
    layout JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    store_id UUID REFERENCES public.stores(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create report_runs table
CREATE TABLE IF NOT EXISTS public.report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_definition_id UUID REFERENCES public.report_definitions(id) ON DELETE CASCADE,
    executed_by UUID REFERENCES auth.users(id),
    executed_at TIMESTAMPTZ DEFAULT now(),
    parameters_snapshot JSONB NOT NULL,
    file_url TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    error_message TEXT,
    store_id UUID REFERENCES public.stores(id)
);

-- Enable RLS
ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_definitions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can view their own report definitions') THEN
        CREATE POLICY "Users can view their own report definitions"
            ON public.report_definitions FOR SELECT
            USING (auth.uid() = created_by OR EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = auth.uid() AND store_id = report_definitions.store_id AND role IN ('admin', 'manager', 'encargado')
            ));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can create their own report definitions') THEN
        CREATE POLICY "Users can create their own report definitions"
            ON public.report_definitions FOR INSERT
            WITH CHECK (auth.uid() = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can update their own report definitions') THEN
        CREATE POLICY "Users can update their own report definitions"
            ON public.report_definitions FOR UPDATE
            USING (auth.uid() = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can view their own report runs') THEN
        CREATE POLICY "Users can view their own report runs"
            ON public.report_runs FOR SELECT
            USING (auth.uid() = executed_by OR EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = auth.uid() AND store_id = report_runs.store_id AND role IN ('admin', 'manager', 'encargado')
            ));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can insert their own report runs') THEN
        CREATE POLICY "Users can insert their own report runs"
            ON public.report_runs FOR INSERT
            WITH CHECK (auth.uid() = executed_by);
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.report_definitions TO authenticated;
GRANT ALL ON public.report_runs TO authenticated;
GRANT ALL ON public.report_definitions TO service_role;
GRANT ALL ON public.report_runs TO service_role;
