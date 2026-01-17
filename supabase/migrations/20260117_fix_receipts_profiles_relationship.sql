-- Migration: Fix relationship between receipts and profiles
-- Date: 2026-01-17

BEGIN;

-- 1. Add foreign key from receipts.user_id to public.profiles(id)
-- This allows PostgREST to automatically detect the relationship for joins
ALTER TABLE public.receipts
ADD CONSTRAINT receipts_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- 2. Backfill store_id in receipts if it's null
-- Using the store_id from the profile of the user who created the receipt
UPDATE public.receipts r
SET store_id = p.store_id
FROM public.profiles p
WHERE r.user_id = p.id
  AND r.store_id IS NULL;

-- 3. Ensure store_id is not null for future records if desired,
-- but we'll leave it as is for now to avoid breaking existing logic that might not have store_id yet.

COMMIT;
