-- DECLARED FINAL STATE (Git) de fn_generate_physical_count_number
-- fuente: 20260726000020_v2_9_h6_physical_count.sql stmt#6

CREATE OR REPLACE FUNCTION public.fn_generate_physical_count_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.count_number IS NULL THEN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.physical_counts
    WHERE store_id = NEW.store_id
      AND created_at >= date_trunc('year', NOW());
    NEW.count_number := 'PC-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(v_count::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$
