-- Phase 2: Data Model Changes

-- 1. Extend user_role enum safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'encargado') THEN
        ALTER TYPE user_role ADD VALUE 'encargado';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'usuario') THEN
        ALTER TYPE user_role ADD VALUE 'usuario';
    END IF;
END $$;

-- 2. Create user_store_access table
CREATE TABLE IF NOT EXISTS public.user_store_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, store_id)
);

-- 3. Update profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS max_stores_limit integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_users_limit integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 4. Update stores table
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 5. Data Migration: Populate user_store_access from existing profiles.store_id
INSERT INTO public.user_store_access (user_id, store_id)
SELECT id, store_id FROM public.profiles WHERE store_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Data Migration: Set active_store_id from existing profiles.store_id
UPDATE public.profiles SET active_store_id = store_id WHERE store_id IS NOT NULL AND active_store_id IS NULL;
