-- Add roles array column to user_store_access to allow multiple roles per store
ALTER TABLE public.user_store_access
DROP COLUMN IF EXISTS role;

ALTER TABLE public.user_store_access
ADD COLUMN IF NOT EXISTS roles user_role[] DEFAULT '{clerk}';

-- Comment explaining the change
COMMENT ON COLUMN public.user_store_access.roles IS 'The specific roles the user has in this store.';
