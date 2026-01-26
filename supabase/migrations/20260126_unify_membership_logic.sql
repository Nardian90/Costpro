-- Migration: Unify Business Logic to User Store Memberships
-- This migration updates triggers to use user_store_memberships instead of user_store_access.

BEGIN;

-- 1. Update validate_active_store to use memberships
CREATE OR REPLACE FUNCTION public.validate_active_store()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.active_store_id IS NOT NULL THEN
        -- Check in user_store_memberships (the new source of truth)
        IF NOT EXISTS (
            SELECT 1 FROM public.user_store_memberships
            WHERE user_id = NEW.id
              AND store_id = NEW.active_store_id
              AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have active membership in the selected store.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update auto_assign_store_to_creator to use memberships
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
$$ LANGUAGE plpgsql;

COMMIT;
