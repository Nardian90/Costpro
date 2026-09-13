-- DECLARED FINAL STATE (Git) de set_default_due_date_commission
-- fuente: 20260713000004_commission_payments_due_date.sql stmt#4

CREATE OR REPLACE FUNCTION public.set_default_due_date_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.period_end IS NOT NULL THEN
    NEW.due_date := NEW.period_end + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
