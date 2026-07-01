-- Add store_id to cost_sheet_templates
ALTER TABLE public.cost_sheet_templates ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

-- Drop old policies
DROP POLICY IF EXISTS "Allow read system and public templates" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Allow insert own templates" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Allow update own templates" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Allow delete own templates" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Allow read own private templates" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates visibility" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates insert" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates update" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates delete" ON public.cost_sheet_templates;

-- Helper function to check if user is admin if not exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New SELECT policy
CREATE POLICY "Templates visibility" ON public.cost_sheet_templates
FOR SELECT TO authenticated
USING (
  type = 'system' OR
  (type = 'public' AND (store_id IS NULL OR store_id IN (SELECT active_store_id FROM public.profiles WHERE id = auth.uid()))) OR
  (type = 'private' AND created_by = auth.uid())
);

-- New INSERT policy (Admin only as per user request)
CREATE POLICY "Templates insert" ON public.cost_sheet_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
);

-- New UPDATE policy
CREATE POLICY "Templates update" ON public.cost_sheet_templates
FOR UPDATE TO authenticated
USING (
  public.is_admin()
);

-- New DELETE policy
CREATE POLICY "Templates delete" ON public.cost_sheet_templates
FOR DELETE TO authenticated
USING (
  public.is_admin()
);
