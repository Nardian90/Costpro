-- Migration: RLS policies for audit_logs scoped by tienda
-- F6-T03 + A5: Permite a admin/encargado ver logs de auditoría filtrados por store_id
-- basado en su membership. Los logs globales (sin store_id) son solo para admin.
-- A5: Añadida política INSERT para que audit-service.ts (client-side) pueda loggear.

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read logs for stores they belong to + global logs (admin only)
DROP POLICY IF EXISTS "audit_logs_select_own_and_managed" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own_and_managed" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR (store_id IS NOT NULL AND public.has_store_role(store_id, ARRAY['admin', 'manager', 'encargado']))
  );

-- A5: INSERT: all authenticated users can insert audit logs (audit-service.ts logs events)
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE public.audit_logs IS
  'F6-T03: Audit logs with RLS. Admin sees all; managers see their stores. All authenticated users can INSERT (audit service logs events).';
