-- Add metadata columns for Pick 3 auditing and hardening
ALTER TABLE public.pick3_history
ADD COLUMN IF NOT EXISTS fireball integer,
ADD COLUMN IF NOT EXISTS sync_method text DEFAULT 'web',
ADD COLUMN IF NOT EXISTS raw_text text;

-- Create a unique constraint to ensure idempotency if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pick3_history_date_time_unique'
    ) THEN
        ALTER TABLE public.pick3_history
        ADD CONSTRAINT pick3_history_date_time_unique UNIQUE (draw_date, draw_time);
    END IF;
END $$;

COMMENT ON COLUMN public.pick3_history.fireball IS 'The Fireball number for the draw';
COMMENT ON COLUMN public.pick3_history.sync_method IS 'Source type: web or pdf';
COMMENT ON COLUMN public.pick3_history.raw_text IS 'Original parsed text for audit purposes';
