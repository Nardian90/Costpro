-- Migration: Create user_audit_log table
-- Description: Fixes missing table for user management auditing

CREATE TABLE IF NOT EXISTS public.user_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    performed_by UUID, -- actor
    target_user_id UUID, -- target user (if applicable)
    action TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB
);

-- Enable RLS
ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins and managers can see user audit logs
CREATE POLICY "Admins and managers can view user audit logs"
ON public.user_audit_log
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')
);

-- Index for performance
CREATE INDEX idx_user_audit_log_target_user ON public.user_audit_log(target_user_id);
CREATE INDEX idx_user_audit_log_created_at ON public.user_audit_log(created_at);

-- Grant permissions
GRANT SELECT ON public.user_audit_log TO authenticated;
GRANT INSERT ON public.user_audit_log TO authenticated;
