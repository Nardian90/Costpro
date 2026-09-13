-- DECLARED FINAL STATE (Git) de auto_assign_store_to_creator
-- fuente: 20260126_unify_membership_logic.sql stmt#2

CREATE OR REPLACE FUNCTION public.auto_assign_store_to_creator()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        -- Insert into memberships
        INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
        VALUES (NEW.created_by, NEW.id, 'admin', 'active')
        ON CONFLICT (user_id, store_id) DO NOTHING;

        -- Also keep user_store_access updated for legacy compatibility if it exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_store_access') THEN
            INSERT INTO public.user_store_access (user_id, store_id, assigned_by)
            VALUES (NEW.created_by, NEW.id, NEW.created_by)
            ON CONFLICT (user_id, store_id) DO NOTHING;
        END IF;

        -- If the creator has no active store, set this as active
        UPDATE public.profiles
        SET active_store_id = NEW.id
        WHERE id = NEW.created_by AND active_store_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
