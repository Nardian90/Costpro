-- DECLARED FINAL STATE (Git) de set_default_due_date_receipt
-- fuente: 20260712000001_payment_tracking.sql stmt#12

CREATE OR REPLACE FUNCTION set_default_due_date_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.reception_date IS NOT NULL THEN
    NEW.due_date := (NEW.reception_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
