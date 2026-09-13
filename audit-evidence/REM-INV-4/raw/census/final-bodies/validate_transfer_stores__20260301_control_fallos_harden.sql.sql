-- DECLARED FINAL STATE (Git) de validate_transfer_stores
-- fuente: 20260301_control_fallos_harden.sql stmt#12

CREATE OR REPLACE FUNCTION public.validate_transfer_stores()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.origin_store_id = NEW.destination_store_id THEN
        RAISE EXCEPTION 'Origin and Destination stores must be different';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
