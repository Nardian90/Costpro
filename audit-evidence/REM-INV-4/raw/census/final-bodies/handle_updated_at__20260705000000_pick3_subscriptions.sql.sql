-- DECLARED FINAL STATE (Git) de handle_updated_at
-- fuente: 20260705000000_pick3_subscriptions.sql stmt#23

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
