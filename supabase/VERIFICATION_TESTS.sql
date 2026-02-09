-- ==============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN: Validar que las correcciones funcionan
-- ==============================================================================
-- Ejecutar estos queries DESPUÉS de aplicar la migración
-- para confirmar que el sistema está operacional
-- ==============================================================================

-- ============================================================================
-- TEST 1: ¿Funciona is_admin() correctamente?
-- ============================================================================

-- 1a. Ver el contenido de la función
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_admin'
ORDER BY routine_name;

-- 1b. Verificar que hay admins en la BD
SELECT 
  id,
  full_name,
  email,
  role::text as role_enum,
  is_active
FROM public.profiles
WHERE role::text IN ('admin', 'superadmin')
LIMIT 5;

-- 1c. Verifica si los admins EXISTEN
SELECT count(*) as admin_count FROM public.profiles WHERE role::text IN ('admin', 'superadmin');

-- ============================================================================
-- TEST 2: ¿Se han consolidado las policies en 'stores'?
-- ============================================================================

-- 2a. Listar todas las policies en stores DESPUÉS de la migración
SELECT
  policyname,
  cmd as operation,
  qual as "USING_condition",
  with_check as "WITH_CHECK_condition"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'stores'
ORDER BY policyname;

-- 2b. Verificar que NO existan policies viejas (duplicadas)
-- Si este query devuelve rows, hay un problema
SELECT policyname 
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'stores'
  AND policyname IN (
    'Stores management',
    'Stores visibility', 
    'Users can view all stores'
  );

-- ============================================================================
-- TEST 3: ¿Existe la nueva policy de admin en 'profiles'?
-- ============================================================================

SELECT
  policyname,
  cmd as operation,
  qual as "USING_condition",
  with_check as "WITH_CHECK_condition"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname = 'profiles_admin_full_access';

-- ============================================================================
-- TEST 4: Simulación - ¿Un admin VERÍA tiendas? (lógica de RLS)
-- ============================================================================

-- NOTA: Este test SIMULA la lógica RLS sin ejecutar realmente como el usuario
-- En producción, esto debería verificarse desde el cliente frontend

-- 4a. Contar tiendas totales
SELECT count(*) as total_stores FROM public.stores;

-- 4b. Contar tiendas activas
SELECT count(*) as active_stores FROM public.stores WHERE is_active = true;

-- 4c. Verificar que tiendas tienen memberships
SELECT 
  s.id,
  s.name,
  s.is_active,
  count(m.id) as member_count
FROM public.stores s
LEFT JOIN public.user_store_memberships m ON m.store_id = s.id
GROUP BY s.id, s.name, s.is_active
ORDER BY s.name;

-- ============================================================================
-- TEST 5: ¿Los admins pueden editar perfiles ajenos? (simulación RLS)
-- ============================================================================

-- 5a. Contar usuarios totales
SELECT count(*) as total_users FROM public.profiles;

-- 5b. Contar usuarios activos vs inactivos
SELECT 
  is_active,
  count(*) as user_count
FROM public.profiles
GROUP BY is_active;

-- 5c. Verificar que la nueva policy existe y está correcta
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname = 'profiles_admin_full_access';

-- ============================================================================
-- TEST 6: Auditoría - ¿Se registró la migración?
-- ============================================================================

SELECT 
  id,
  created_at,
  action,
  table_name,
  new_data
FROM public.audit_logs
WHERE action = 'MIGRATION_FIX_RLS_CRITICAL'
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- TEST 7: Verificar multi-tenant aislamiento SIGUE intacto
-- ============================================================================

-- Contar memberships por store
SELECT 
  store_id,
  count(*) as member_count,
  string_agg(DISTINCT(role::text), ', ') as roles
FROM public.user_store_memberships
WHERE status = 'active'::membership_status
GROUP BY store_id
ORDER BY member_count DESC;

-- Verificar que admins tienen memberships en tiendas (si aplica)
SELECT 
  p.full_name,
  p.role::text,
  s.name,
  usm.role::text as membership_role,
  usm.status
FROM public.profiles p
LEFT JOIN public.user_store_memberships usm ON p.id = usm.user_id
LEFT JOIN public.stores s ON usm.store_id = s.id
WHERE p.role::text = 'admin'
ORDER BY p.full_name, s.name;

-- ============================================================================
-- TEST 8: Resumen de Seguridad - Checklist de validación
-- ============================================================================

-- Todos los checks deben pasar (retornar valores esperados)
SELECT 
  'is_admin() exists' as check_name,
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='is_admin') THEN '✅ PASS' ELSE '❌ FAIL' END as status
UNION ALL
SELECT 
  'get_my_role() exists',
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='get_my_role') THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'stores policies consolidated (count=4)',
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='stores') = 4 THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'Old stores policies removed',
  CASE WHEN NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stores' AND policyname IN('Stores management','Stores visibility','Users can view all stores')) THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'profiles_admin_full_access exists',
  CASE WHEN EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_admin_full_access') THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'Admin users exist in DB',
  CASE WHEN (SELECT count(*) FROM public.profiles WHERE role::text IN('admin','superadmin')) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'Active stores exist',
  CASE WHEN (SELECT count(*) FROM public.stores WHERE is_active=true) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END;

-- ============================================================================
-- QUERIES PARA PRUEBAS MANUALES DESDE FRONTEND
-- ============================================================================

/*

PRUEBA 1: Admin VE tiendas
FROM FRONTEND: 
  const { data: stores } = useStores(adminUserId, true, false);
  console.log(stores.length); // Debe ser > 0

VERIFICACIÓN SQL (sin RLS - como service_role):
  SELECT count(*) FROM public.stores;
  -- Debe coincidir con lo que ve el admin

---

PRUEBA 2: Admin CREA tienda
FROM FRONTEND:
  const result = await supabase
    .from('stores')
    .insert({ name: 'New Store', address: '123 Main St', created_by: adminUserId });
  console.log(result.error); // Debe ser null

VERIFICACIÓN SQL:
  SELECT name FROM public.stores WHERE name = 'New Store';
  -- Debe existir

---

PRUEBA 3: Admin EDITA usuario (is_active = false)
FROM FRONTEND:
  const result = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', targetUserId);
  console.log(result.error); // Debe ser null

VERIFICACIÓN SQL:
  SELECT full_name, is_active FROM public.profiles WHERE id = 'targetUserId';
  -- is_active debe ser false

---

PRUEBA 4: Usuario NORMAL no puede ver tiendas de otro usuario
FROM FRONTEND (logged as user A, Store A):
  const { data: stores } = useStores(userAId, false, false);
  console.log(stores.length); // Debe ser 1 (solo Store A)

VERIFICACIÓN SQL:
  SELECT count(*) FROM public.user_store_memberships 
  WHERE user_id = 'userAId' AND status = 'active';
  -- Debe ser 1

*/
