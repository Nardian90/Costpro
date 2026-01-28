-- Migration: Create sync_log table for idempotency and sync tracking
-- Date: 2026-02-17

BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_log (
    idempotency_key UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    store_id UUID REFERENCES public.stores(id),
    entity TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    status TEXT NOT NULL, -- 'ok', 'error', 'conflict'
    response_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for sync_log
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync logs"
    ON public.sync_log
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync logs"
    ON public.sync_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON public.sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON public.sync_log(created_at);

GRANT ALL ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;

COMMIT;
