-- GATE 10 · Actor prerequisites + store row (READ ONLY)
SELECT jsonb_build_object(
  'is_admin_def', (
    SELECT COALESCE(max(pg_get_functiondef(p.oid)),'NOT_FOUND') FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin'
  ),
  'admin_candidates', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'role',p.role,'roles',p.roles,'is_active',p.is_active,'tenant_id',p.tenant_id)),'[]'::jsonb)
    FROM profiles p WHERE p.id IN ('051c6157-600b-425e-b8c0-72388bacf541','a1111111-1111-1111-1111-111111111111')
  ),
  'store_row', (
    SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM stores s WHERE s.id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'global_admins', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'role',p.role,'is_active',p.is_active)),'[]'::jsonb)
    FROM profiles p WHERE p.role='admin' AND p.is_active=true
  )
) AS evidence;
