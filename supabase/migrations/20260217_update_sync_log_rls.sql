-- Migration: Add UPDATE policy to sync_log
-- Date: 2026-02-17

BEGIN;

CREATE POLICY "Users can update their own sync logs"
    ON public.sync_log
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

COMMIT;
