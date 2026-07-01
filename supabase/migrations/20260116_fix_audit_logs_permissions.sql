-- Migration: Enable RLS and permissions for audit_logs
-- Date: 2026-01-16

BEGIN;

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins and managers to read audit logs
DROP POLICY IF EXISTS "Allow admins and managers to read audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins and managers to read audit logs" ON public.audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

-- Deny all direct writes from client
DROP POLICY IF EXISTS "Deny all direct writes to audit logs" ON public.audit_logs;
CREATE POLICY "Deny all direct writes to audit logs" ON public.audit_logs
FOR ALL
USING (true)
WITH CHECK (false);

COMMIT;
