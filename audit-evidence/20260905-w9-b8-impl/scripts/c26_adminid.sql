SELECT 'profile' AS src, id::text, email, (deleted_at IS NOT NULL) AS deleted, (is_active) AS active FROM public.profiles WHERE email='admin@costpro.com'
UNION ALL
SELECT 'authuser', id::text, email, false, true FROM auth.users WHERE email='admin@costpro.com';
