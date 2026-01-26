-- Migration: Fix Audit Logs RLS and Schema Consistency
-- Date: 2026-01-26
-- Description: Adds updated_at column to audit_logs and updates RLS to include 'encargado' role.

BEGIN;

-- 1. Add updated_at column to audit_logs if it doesn't exist
ALTER TABLE IF EXISTS public.audit_logs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Ensure existing records have updated_at populated
UPDATE public.audit_logs SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Add trigger for updated_at
DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON public.audit_logs;
CREATE TRIGGER update_audit_logs_updated_at
    BEFORE UPDATE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Update RLS policies for audit_logs
-- We drop the old policy and create a new one that is more inclusive and uses established helpers
DROP POLICY IF EXISTS "Allow admins and managers to read audit logs" ON public.audit_logs;

CREATE POLICY "Allow admins, managers and encargados to read audit logs" ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_role('manager')
  OR public.has_role('encargado')
);

-- Deny all direct writes from client
-- We use separate policies for clarity and to avoid unintended SELECT permissions
DROP POLICY IF EXISTS "Deny all direct writes to audit logs" ON public.audit_logs;

CREATE POLICY "Deny direct inserts to audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny direct updates to audit logs" ON public.audit_logs
FOR UPDATE USING (false);

CREATE POLICY "Deny direct deletes to audit logs" ON public.audit_logs
FOR DELETE USING (false);

COMMIT;
