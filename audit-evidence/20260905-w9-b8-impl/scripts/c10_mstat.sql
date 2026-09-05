SELECT role::text AS role, status::text AS status, count(*)::int AS n
FROM public.user_store_memberships GROUP BY role, status ORDER BY role, status;
