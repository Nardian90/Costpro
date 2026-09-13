-- DECLARED FINAL STATE (Git) de set_default_due_date_service
-- fuente: 20260712000001_payment_tracking.sql stmt#15

CREATE OR REPLACE FUNCTION set_default_due_date_service()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.service_date IS NOT NULL THEN
    NEW.due_date := (NEW.service_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
