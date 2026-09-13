-- DECLARED FINAL STATE (Git) de update_updated_at_column
-- fuente: 20260612000000_create_ofertas.sql stmt#13

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
