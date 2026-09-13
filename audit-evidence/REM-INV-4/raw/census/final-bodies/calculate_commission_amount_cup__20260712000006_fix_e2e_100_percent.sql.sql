-- DECLARED FINAL STATE (Git) de calculate_commission_amount_cup
-- fuente: 20260712000006_fix_e2e_100_percent.sql stmt#5

CREATE OR REPLACE FUNCTION calculate_commission_amount_cup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.currency = 'CUP' OR NEW.currency IS NULL THEN
      NEW.amount_cup := NEW.final_amount;
    ELSE
      NEW.amount_cup := NEW.final_amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  ELSE
    NEW.amount_cup := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
