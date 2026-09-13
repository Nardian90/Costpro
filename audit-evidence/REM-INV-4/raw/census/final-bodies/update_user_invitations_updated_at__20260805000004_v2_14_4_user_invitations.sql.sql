-- DECLARED FINAL STATE (Git) de update_user_invitations_updated_at
-- fuente: 20260805000004_v2_14_4_user_invitations.sql stmt#1

CREATE OR REPLACE FUNCTION public.update_user_invitations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$
