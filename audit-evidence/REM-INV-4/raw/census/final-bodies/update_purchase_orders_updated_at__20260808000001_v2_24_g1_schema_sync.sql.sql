-- DECLARED FINAL STATE (Git) de update_purchase_orders_updated_at
-- fuente: 20260808000001_v2_24_g1_schema_sync.sql stmt#6

CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$
